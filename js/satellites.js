// TODO: import images, then have GPU kernel implement geocolor

import { h5wasm } from './lib/hdf5/hdf5_hl.js';
const { FS } = await h5wasm.ready;

// resolution of background images
const width = 4999;
const height = 3000;

// For bezier interpolation, we aren't plotting the end-points, so we generate
// one future point with index 0, and the target date is at index 1
function celestial_angles(date) {

    // Angle of prime meridian from equinox of date, converted to radians
    let sidereal_angle = Astronomy.SiderealTime(date) * Math.PI / 12.0;

    /// J2000 geocentric equatorial coordinates of the Sun [AU]
    let sun_vec_epoch = Astronomy.GeoVector('Sun', date, true);
    let moon_vec_epoch = Astronomy.GeoVector('Moon', date, true);

    /// rotation matrix from J2000 to Equatorial of date
    let rot = Astronomy.Rotation_EQJ_EQD(date);

    // Equatorial coordinates at target date (adjust for precession, nutation)
    let sun_vec = Astronomy.RotateVector(rot, sun_vec_epoch);
    let moon_vec = Astronomy.RotateVector(rot, moon_vec_epoch);

    return [
        { // sun
            polar_angle: Math.acos(sun_vec.z / sun_vec.Length()),
            longitude: Math.atan2(sun_vec.y, sun_vec.x) - sidereal_angle,
        },
        { // moon
            polar_angle: Math.acos(moon_vec.z / moon_vec.Length()),
            longitude: Math.atan2(moon_vec.y, moon_vec.x) - sidereal_angle,
        }
    ];

}

// https://github.com/gpujs/gpu.js/#alpha
const gpu_canvas = document.createElement('canvas');
gpu_canvas.width = width;
gpu_canvas.height = height;
const gpu_gl = gpu_canvas.getContext('webgl2', { premultipliedAlpha: false });
let gpu;
try {
    gpu = new GPU.GPU({ // Chrome
        gpu_canvas,
        context: gpu_gl
    });
} catch(error) {
    gpu = new GPU({ // Firefox
        gpu_canvas,
        context: gpu_gl
    });
}

// tha is theta (north polar angle)
// phi is longitude
const gpu_render = gpu.createKernel(function (
    tha_sun, phi_sun, tha_moon, phi_moon, month_alpha,
    pst_month_img, ftr_month_img, night_img,
    vis_arr, lir_arr) {

    const width = 4999;
    const height = 3000;

    // ugly, but I didn't find a better way to do this, surprisingly,
    // without running into odd compilation issues.
    const pst_pixel = pst_month_img[this.thread.y][this.thread.x];
    const ftr_pixel = ftr_month_img[this.thread.y][this.thread.x];
    const day_r = (
        month_alpha * pst_pixel[0] +
            (1 - month_alpha) * ftr_pixel[0]
    );
    const day_g = (
        month_alpha * pst_pixel[1] +
            (1 - month_alpha) * ftr_pixel[1]
    );
    const day_b = (
        month_alpha * pst_pixel[2] +
            (1 - month_alpha) * ftr_pixel[2]
    );
    const day = [day_r, day_g, day_b];

    const night = night_img[this.thread.y][this.thread.x];


    ////////////////////////////////////////////////////////////////////////////
    // day-night divide

    let light = 1; // biblical pun

    const phi = (2 * this.thread.x / width - 1) * Math.PI; // [-pi, pi]

    // y is given to us from bottom of image, contrary to normal graphics coordinates.
    const tha = (1 - this.thread.y / height) * Math.PI;    // [0, pi]

    // dot products in spherical polar coordinates
    const moon_sun_dot = Math.sin(tha_sun) * Math.sin(tha_moon) * Math.cos(phi_sun - phi_moon) + Math.cos(tha_moon) * Math.cos(tha_sun);
    const sun_dot = Math.sin(tha_sun) * Math.sin(tha) * Math.cos(phi_sun - phi) + Math.cos(tha) * Math.cos(tha_sun);
    const moon_dot = Math.sin(tha_moon) * Math.sin(tha) * Math.cos(phi_moon - phi) + Math.cos(tha) * Math.cos(tha_moon);

    // how much light to add from moon
    let moon_illum = (((1 - moon_sun_dot) / 2) ** 2) / 4; // [0, 1]

    // account for atmospheric refraction for sunset
    const sunset_refrac = Math.PI * (35 / 60) / 180; // sun visible 35 arc minutes past geometric setting
    const sun_diameter = Math.PI * 0.5 / 180; // angular diameter of sun

    // angle that sun appears above horizon (for values near zero)
    const sun_horizon_angle = Math.asin(sun_dot) + sunset_refrac;

    // vertical coordinate of sun's center relative to horizon in solar radii
    const x = Math.min(Math.max((sun_horizon_angle - sun_diameter) / sun_diameter, -1), 1)

    // fraction of sun's area we can see from here
    const visible_sun_area = x * sqrt(1 - x ** 2) + Math.asin(x) + (Math.PI / 2)

    // discontinuous, piece-wise linear fade for sun
    const max_twilight = 0.5; // as bright as it gets after sunset
    const twilight_slope = 9 / Math.PI; // rate of brightness fade in twilight

    const min_daylight = 0.6; // as dim as it gets while sun is visible
    const daylight_slope = 12 / Math.PI; // rate of brightness fade in daylight


    if (visible_sun_area > 0.99) {
        light = min_daylight + sun_horizon_angle * daylight_slope;
    } else if (visible_sun_area < 0.01) {
        light = max_twilight + sun_dot * twilight_slope;
    } else {
        light = max_twilight + visible_sun_area * (min_daylight - max_twilight);
    }

    // clamp values
    light = Math.max(0, Math.min(1, light));

    // account for moon
    if (moon_dot > 0) { // moon is visible
        light = light + moon_illum * moon_dot ** 2 * 0.5;
    }

    // clamp values again
    light = Math.max(0, Math.min(1, light));

    ////////////////////////////////////////////////////////////////////////////

    // starts
    let z = (2 * this.thread.y / height - 1);
    let mapped_y = Math.floor(
        height - 1 - (
            0.82 * z +
            0.5 * z * z * z
        ) * (height / 2) - (height / 2)
    );

    // https://vlab.noaa.gov/web/towr-s/gmgsi

    // The Visible composite band is ~0.6 microns, (redish)
    // which may be used to view cloud cover, ice, and snow cover.
    const vis = vis_arr[mapped_y][this.thread.x] / 255;

    // The Longwave/Window IR band is ~12.0 microns, which shows cloud cover
    // and surface temperature.
    const lir = lir_arr[mapped_y][this.thread.x] / 255;


    // Loosely based on GeoColor by Miller et. al.
    // https://repository.library.noaa.gov/view/noaa/30693


    let gamma = 2;
    let night_clouds = Math.max(0, Math.min(
        1,
        (2 - z * z) / 2 * (gamma + 1) * (lir * lir) / (1 + gamma * lir * lir)
    ));
    let night_cloud_mask = 8 * night_clouds / (1 + 7 * night_clouds);
    let day_clouds = (2 - z * z) / 2 * (gamma + 1) * (vis * lir) / (1 + gamma * vis * lir) + (1 - light) * night_clouds;

    let red = (
        light * (day_clouds + day[0] * 0.5) +
            (1 - light) * (night_clouds / 8 + (1 - night_cloud_mask) * night[0] * 4 * night[1] / (1 + 3 * night[1]))
    );
    let green = (
        light * (day_clouds + day[1] * 0.5) +
            (1 - light) * (night_clouds / 12 + (1 - night_cloud_mask) * night[1] * 4 * night[1] / (1 + 3 * night[1]))
    );
    let blue = (
        light * (day_clouds + day[2] * 0.5) +
            (1 - light) * (night_clouds / 8 + (1 - night_cloud_mask) * night[2] * 4 * night[1] / (1 + 3 * night[1]))
    ); // TODO remove blue channel, replace with green for night

    this.color(red, green, blue, 1);

})
    .setOutput([width, height])
    .setGraphical(true);


////////////////////////////////////////////////////////////////////////////////
//  ____             _               ____  _ _
// | __ )  ___  _ __(_)_ __   __ _  | __ )(_) |_ ___
// |  _ \ / _ \| '__| | '_ \ / _` | |  _ \| | __/ __|
// | |_) | (_) | |  | | | | | (_| | | |_) | | |_\__ \
// |____/ \___/|_|  |_|_| |_|\__, | |____/|_|\__|___/
//                           |___/


let loading_div = document.getElementById("loading");
function loading_msg(text) {
    let msg = document.createElement("p");
    msg.innerHTML = "> " + text;
    loading_div.appendChild(msg);
}

function get_satellite_date(date, callback) {

    loading_msg("Polling for most recent data.")

    let year = date.getFullYear();
    let month = date.getUTCMonth(); // [0, 11]
    let day = date.getUTCDate();
    let hour = date.getUTCHours();

    let s_month = (month<9? '0' + (month + 1):month+1);
    let s_day = (day<10? '0' + day:day);
    let s_hour = (hour<10? '0' + hour:hour);

    let vis_src = `https://noaa-gmgsi-pds.s3.amazonaws.com/GMGSI_VIS/${year}/${s_month}/${s_day}/${s_hour}/GLOBCOMPVIS_nc.${year}${s_month}${s_day}${s_hour}`;
    let lir_src = `https://noaa-gmgsi-pds.s3.amazonaws.com/GMGSI_LW/${year}/${s_month}/${s_day}/${s_hour}/GLOBCOMPLIR_nc.${year}${s_month}${s_day}${s_hour}`;

    let awaiting = new Set(["vis", "lir"]);

    function handle_response(name, status) {

        if (awaiting == false) {
            return;
        }
        if (status == false) {
            awaiting = false;

            // use previous hour
            let date = new Date(Date.UTC(year, month, day, hour - 1));
            callback(date);

        } else {
            awaiting.delete(name);
        }

        if (awaiting.size == 0) {

            // use true clock hour
            let date = new Date(Date.UTC(year, month, day, hour));
            callback(date);

        } 
    }

    // ensure file exists, otherwise fall back an hour
    var vis_xhr = new XMLHttpRequest();
    vis_xhr.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                handle_response("vis", true);
            } else {
                handle_response("vis", false);
            }
        }
    };
    vis_xhr.open('HEAD', vis_src, true);
    vis_xhr.send();

    var lir_xhr = new XMLHttpRequest();
    lir_xhr.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                handle_response("lir", true);
            } else {
                handle_response("lir", false);
            }
        }
    };
    lir_xhr.open('HEAD', lir_src, true);
    lir_xhr.send();

}

function get_satellite_data(date, onload_callback) {

    let year = date.getFullYear();
    let month = date.getUTCMonth(); // [0, 11]
    let day = date.getUTCDate();
    let hour = date.getUTCHours();

    let s_month = (month<9? '0' + (month + 1):month+1);
    let s_day = (day<10? '0' + day:day);
    let s_hour = (hour<10? '0' + hour:hour);

    let vis_src = `https://noaa-gmgsi-pds.s3.amazonaws.com/GMGSI_VIS/${year}/${s_month}/${s_day}/${s_hour}/GLOBCOMPVIS_nc.${year}${s_month}${s_day}${s_hour}`;
    let lir_src = `https://noaa-gmgsi-pds.s3.amazonaws.com/GMGSI_LW/${year}/${s_month}/${s_day}/${s_hour}/GLOBCOMPLIR_nc.${year}${s_month}${s_day}${s_hour}`;

    fetch_sat_image("~0.6 micron data", vis_src, onload_callback);
    fetch_sat_image("~12.0 micron data", lir_src, onload_callback);

}
function fetch_sat_image(name, url, onload_callback) {

    loading_msg(`Fetching ${name} from ${url}.`);

    fetch(url)
        .then(function(response) {
            return response.arrayBuffer()
        })
        .then(function(buffer) {

            loading_msg(`Extracting ${name}.`);

            FS.writeFile(name, new Uint8Array(buffer));
            let f = new h5wasm.File(name, "r");
            onload_callback(name, new GPU.Input(f.get("data").value, [4999, 3000]));

        });

}


for (let month_num=0; month_num<12; month_num++) {
    let img = month_img(month_num)
    img.width = width;
    img.height = height;
}
let night_img = document.getElementById("night");
night_img.width = width;
night_img.height = height;

function month_str(month) { // [0, 11]
    return  ("0" + (((month + 12) % 12) + 1).toString()).slice(-2); // [01, 12]
}
function month_src(month) {
    return "/img/greyline/" + month_str(month) + ".jpg"
}
function month_img(month) {
    return document.getElementById("month" + month_str(month));
}
function get_local_images(pst_month_num, ftr_month_num, onload_callback) {

    // get image elements
    let pst_month_img = month_img(pst_month_num);
    let ftr_month_img = month_img(ftr_month_num);

    // trigger image load if not already loaded
    if (!pst_month_img.dataset.touched) {
        pst_month_img.src = month_src(pst_month_num);
        pst_month_img.dataset.touched = true;
    }
    if (!ftr_month_img.dataset.touched) {
        ftr_month_img.src = month_src(ftr_month_num);
        ftr_month_img.dataset.touched = true;
    }

    pst_month_img.onload = function() { onload_callback("for past month", pst_month_img); };
    ftr_month_img.onload = function() { onload_callback("for future month", ftr_month_img); };

}

let dateEl = document.getElementById("date");

function render_composite(date, callback) {

    get_satellite_date(date, function(date) {

        // render text
        dateEl.innerHTML = date.toUTCString();

        let [sun, moon] = celestial_angles(date);

        let month = date.getUTCMonth(); // [0, 11]
        let day = date.getUTCDate();

        let month_alpha; // weight of pst_month
        let pst_month_num, ftr_month_num;

        if (day < 15) {
            pst_month_num = month - 1;
            ftr_month_num = month;
            month_alpha = 0.5 * (15 - day) / 14; // [1, 14] -> [0.5, 1/28]
        } else {
            pst_month_num = month;
            ftr_month_num = month + 1;
            month_alpha = 0.5 * (1 + (31 - day) / 16); // [15, 31] -> [1, 0.5]
        }

        let sat_data = {
            "~0.6 micron data": undefined,
            "~12.0 micron data": undefined,
        };
        let images = {
            "for past month": undefined,
            "for future month": undefined
        };

        let sat_data_to_load = new Set(["~0.6 micron data", "~12.0 micron data"]);
        let images_to_load = new Set(["for past month", "for future month"]);

        get_satellite_data(date, handle_satellite_ready);
        get_local_images(pst_month_num, ftr_month_num, handle_img_ready);

        function handle_satellite_ready(name, data) {
            sat_data[name] = data;
            sat_data_to_load.delete(name);
            loading_msg(`Loaded ${name}.`);
            attempt_draw();
        }
        function handle_img_ready(name, img) {
            images[name] = img;
            images_to_load.delete(name);
            loading_msg(`Loaded background image ${name}.`);
            attempt_draw();
        }
        function attempt_draw() {
            if ((images_to_load.size == 0) && (sat_data_to_load.size == 0)) {

                loading_msg("Calling GPU Kernel.")

                draw();
            }
        }
        function draw() {

            // render composite to gpu canvas
            gpu_render(
                sun.polar_angle,
                sun.longitude,
                moon.polar_angle,
                moon.longitude,
                month_alpha,
                images["for past month"],
                images["for future month"],
                night_img,
                sat_data["~0.6 micron data"],
                sat_data["~12.0 micron data"]
            );

            callback();
        }

    });

}

function transfer_to_canvas(phi, callback) {
    /* phi: longitude to center in view */

    let canvas = document.getElementById("canvas");
    canvas.width = width;
    canvas.height = height;
    let ctx = canvas.getContext('2d');
    let style_width = Number(getComputedStyle(canvas).getPropertyValue("width").slice(0, -2));
    let style_height = Number(getComputedStyle(canvas).getPropertyValue("height").slice(0, -2));

    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
    // drawIamge(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)

    // https://stackoverflow.com/a/17323608
    let phi_offset = ((((phi / (2 * Math.PI)) % 1) + 1) % 1) * width; // [0, 1]
    ctx.drawImage(
        gpu_canvas,
        0, 0, phi_offset, height,                  // source offset x, offset y, width, height
        width - phi_offset, 0, phi_offset, height  // dest offset x, offset y, width, height
    );
    ctx.drawImage(
        gpu_canvas,
        phi_offset, 0, width - phi_offset, height, // source offset x, offset y, width, height
        0, 0, width - phi_offset, height           // dest offset x, offset y, width, height
    );

    if (callback) {
        callback();
    }

}

let date_in_image;
let date_in_buffer;
let date;

let phi_in_image;
let phi;

let composite_busy = false;
let canvas_busy = false;

var pointer;
var mouse;

function handleMousedown(e) {

    let x = e.clientX;
    let y = e.clientY;

    mouse = {x: x, y: y};
}
function handleTouchstart(e) {

    let x = e.touches[0].clientX;
    let y = e.touches[0].clientY;

    touch = {x: x, y: y};
}

function handleMousemove(e) {

    // global variable in main.js
    if (!mouseDown) {
        return;
    }

    let x = e.clientX;
    let y = e.clientY;

    let dx = -(x - mouse.x) / Number(getComputedStyle(canvas).getPropertyValue("width").slice(0, -2)) * width;
    let dy = -(y - mouse.y)

    if (Math.abs(dx) > Math.abs(dy)) {
        dy = 0;
    } else {
        dx = 0;
    }

    handle_interface({ x: dx, y: dy });
    mouse = { x: x, y: y };

}
function handleTouchmove(e) {
    e.preventDefault();
    e.stopPropagation();

    let x = e.touches[0].clientX;
    let y = e.touches[0].clientY;

    let dx = -(x - touch.x) / Number(getComputedStyle(canvas).getPropertyValue("width").slice(0, -2)) * width;
    let dy = -(y - touch.y)

    if (Math.abs(dx) > Math.abs(dy)) {
        dy = 0;
    } else {
        dx = 0;
    }

    handle_interface({ x: dx, y: dy });

    touch = { x: x, y: y };

}

// currently disabled
function handleWheel(e) {
    e.preventDefault();
    e.stopPropagation();

    let dx = e.deltaX;
    let dy = e.deltaY;

    handle_interface({ x: dx, y: dy });
};

function handle_interface(delta) {
    if (delta.x) {
        // fire up animate_canvas if not already running.
        phi += delta.x / width * 2 * Math.PI;
        addAnimation(animate_canvas);
    }
}

function animate_composite() {
    // our work is done
    if (date_in_buffer == date) {
        removeAnimation(animate_composite);
    }
    // we have work to do
    else {
        // if not currently working on it
        if (!composite_busy) {
            composite_busy = true;
            render_composite(date, function() {
                composite_busy = false;
                date_in_buffer = date;
                addAnimation(animate_canvas);
            });
        }
    }
    // await the next scheduled animation
}

function animate_canvas() {
    // composite canvas is up to date and our work is done
    if ((phi_in_image == phi) && (date_in_image == date_in_buffer)) {
        removeAnimation(animate_canvas);
    }
    // not done
    else {
        // if not currently working on it
        if (!canvas_busy) {
            canvas_busy = true;
            transfer_to_canvas(phi, function() {
                canvas_busy = false;
                date_in_image = date_in_buffer;
                phi_in_image = phi;
            });
        }
    }
    // await next scheduled animation
}

let live_update_interval = 1000 * 60 * 60; // 1 hour

function live_update() {
    date = new Date(date.getTime() + live_update_interval);
    addAnimation(animate_composite);
    setTimeout(live_update, live_update_interval);
}

onReady(function(){

    date = new Date((new Date()).getTime() + 1000 * 3600);
    let hour = date.getUTCHours();
    let minutes = date.getUTCMinutes();

    // split at local ~4:00 am
    phi = -(4 * Math.PI / 6) - (hour + minutes /  60) / 12 * Math.PI;

    // initial render, delay for images to load.
    render_composite(
        date,
        function() {
            transfer_to_canvas(phi);
            setTimeout(live_update, live_update_interval);
        }
    );

    let canvas = document.getElementById("canvas");

    canvas.addEventListener('touchstart', handleTouchstart);
    canvas.addEventListener('touchmove', handleTouchmove);
    canvas.addEventListener('mousedown', handleMousedown);
    canvas.addEventListener('mousemove', handleMousemove);

});
