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

let loading_div = document.getElementById("loading");
function loading_msg(text) {
    let msg = document.createElement("p");
    msg.innerHTML = "> " + text;
    loading_div.appendChild(msg);
    console.log(text);
}

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
} catch (error) {
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
    let zz = (
        0.82 * z +
        0.5 * z * z * z
    );
    let mapped_y = Math.floor(
        height - 1 - zz * (height / 2) - (height / 2)
    );

    // https://vlab.noaa.gov/web/towr-s/gmgsi

    // The Visible composite band is ~0.6 microns, (redish)
    // which may be used to view cloud cover, ice, and snow cover.
    const vis = vis_arr[mapped_y][this.thread.x] / 255;

    // The Longwave/Window IR band is ~12.0 microns, which shows cloud cover
    // and surface temperature.
    const lir = lir_arr[mapped_y][this.thread.x] / 255;

    if (Math.abs(zz) > 1) {
        vis = 0;
        lir = 0;
    }

    // Loosely based on GeoColor by Miller et. al.
    // https://repository.library.noaa.gov/view/noaa/30693

    function limit(x) {
        return Math.min(1, Math.max(0, x));
    }

    function sigmoid(x, gamma, t) {
        return (1 + (gamma + 1) * (x - t) / (1 + gamma * Math.abs(x - t))) / 2;
    }

    const day_cloud_mask = limit(sigmoid(lir * vis, 75, 0.1));
    const night_cloud_mask = limit(sigmoid(lir - day[0] / 15, 8, 0.5 + zz * zz / 2));

    const lum = (vis * 2 + light) / 3;
    const night_lum = (1 - light) / 3;
    const red = (
        lum * (1 - day_cloud_mask) * day[0] + vis * day_cloud_mask +
            night_lum * ((1 - night_cloud_mask) * night[0] + night_cloud_mask / 1.5)
    );
    const green = (
        lum * (1 - day_cloud_mask) * day[1] + vis * day_cloud_mask +
            night_lum * ((1 - night_cloud_mask) * night[1] * night[1] + night_cloud_mask / 3)
    );
    const blue = (
        lum * (1 - day_cloud_mask) * day[2] + vis * day_cloud_mask +
            night_lum * ((1 - night_cloud_mask) * night[2] * night[1] + night_cloud_mask / 2.5)
    );

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



function get_satellite_date(call_date, callback) {

    loading_msg(`Polling for most recent data at ${call_date.toUTCString()}.`);

    let year = call_date.getFullYear();
    let month = call_date.getUTCMonth(); // [0, 11]
    let day = call_date.getUTCDate();
    let hour = call_date.getUTCHours();

    let query_date = new Date(Date.UTC(year, month, day, hour));

    function query(date, name, inner_callback) {

        let year = date.getFullYear();
        let month = date.getUTCMonth(); // [0, 11]
        let day = date.getUTCDate();
        let hour = date.getUTCHours();

        let s_month = (month<9? '0' + (month + 1):month+1);
        let s_day = (day<10? '0' + day:day);
        let s_hour = (hour<10? '0' + hour:hour);

        let src = {
            "vis": `https://noaa-gmgsi-pds.s3.amazonaws.com/GMGSI_VIS/${year}/${s_month}/${s_day}/${s_hour}/GLOBCOMPVIS_nc.${year}${s_month}${s_day}${s_hour}`,
            "lir": `https://noaa-gmgsi-pds.s3.amazonaws.com/GMGSI_LW/${year}/${s_month}/${s_day}/${s_hour}/GLOBCOMPLIR_nc.${year}${s_month}${s_day}${s_hour}`
        };

        // ensure file exists, otherwise fall back an hour
        var vis_xhr = new XMLHttpRequest();
        vis_xhr.onreadystatechange = function() {
            if (this.readyState == 4) {
                if (this.status == 200) {
                    inner_callback(date);
                } else {
                    query(new Date(date.getTime() - 1000 * 3600), name, inner_callback);
                }
            }
        };
        vis_xhr.open('HEAD', src[name], true);
        vis_xhr.send();
    }

    query(query_date, "vis", function (found_date) {
        query(found_date, "lir", function (use_date) {
            loading_msg(`Using data from ${use_date.toUTCString()}.`);
            callback(use_date);
        });
    });

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

    loading_msg(`Fetching ${name} from <a href="${url}">${url}</a>.`);

    fetch(url)
        .then(function(response) {
            return response.arrayBuffer()
        })
        .then(function(buffer) {

            loading_msg(`Extracting ${name}.`);

            FS.writeFile(name, new Uint8Array(buffer));
            let f = new h5wasm.File(name, "r");
            onload_callback(name, new GPU.Input(f.get("data").value, [4999, 3000]));
            f.close()

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
        pst_month_img.onload = function() {
            pst_month_img.dataset.touched = true;
            onload_callback("for past month", pst_month_img);
        };
        pst_month_img.src = month_src(pst_month_num);
    } else {
        onload_callback("for past month", pst_month_img);
    }
    if (!ftr_month_img.dataset.touched) {
        ftr_month_img.onload = function() {
            ftr_month_img.dataset.touched = true;
            onload_callback("for future month", ftr_month_img);
        };
        ftr_month_img.src = month_src(ftr_month_num);
    } else {
        onload_callback("for future month", ftr_month_img);
    }
}

let dateEl = document.getElementById("date");
let lrmsgEl = document.getElementById("lrmsg");
let diffEl = document.getElementById("diff");


let live_update_interval = 1000 * 12; // 12 seconds = 0.5 pixel at 3600 px width
var updates_per_poll = 100; // poll for new data every 20 minutes (new data triggers repaint)
var updates_since_last_poll = updates_per_poll;
var last_data_date = new Date(0);

function get_lag_string() {
    let diff = Math.floor((date_to_render.getTime() - last_data_date.getTime()) / 1000);
    let h = Math.floor(diff / 3600);
    let m = Math.floor(diff / 60) % 60;
    let mm = (m<10? '0' + m : m);
    let s = diff % 60;
    let ss = (s<10? '0' + s : s);
    return `-${h}:${mm}:${ss}`;
}

let currently_polling = false;
function render_composite(request_date, callback) {

    // skip re-rendering
    if ((updates_since_last_poll < updates_per_poll) || currently_polling) {
        updates_since_last_poll += 1;
        return callback();
    }

    currently_polling = true;

    // poll for recent data and maybe repaint
    get_satellite_date(request_date, function(data_date) {

        updates_since_last_poll = 0;
        currently_polling = false;

        // no data change
        if (data_date.getTime() == last_data_date.getTime()) {
            return callback();
        } else {

            // new data! Continue from here
            last_data_date = data_date;
        }

        // render text
        dateEl.innerHTML = data_date.toUTCString();

        let [sun, moon] = celestial_angles(data_date);

        let month = data_date.getUTCMonth(); // [0, 11]
        let day = data_date.getUTCDate();

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

        get_satellite_data(data_date, handle_satellite_ready);
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

                loading_msg("Rendering Image.")

                draw();

                lrmsgEl.innerHTML = ("Press [Esc] or click here to toggle render.");

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

    let crop = 230;

    // https://stackoverflow.com/a/17323608
    let phi_offset = ((((phi / (2 * Math.PI)) % 1) + 1) % 1) * width; // [0, 1]
    ctx.drawImage(
        gpu_canvas,
        0, crop, phi_offset, height - crop,               // source offset x, offset y, width, height
        width - phi_offset, 0, phi_offset, height         // dest offset x, offset y, width, height
    );
    ctx.drawImage(
        gpu_canvas,
        phi_offset, crop, width - phi_offset, height - crop,  // source offset x, offset y, width, height
        0, 0, width - phi_offset, height                   // dest offset x, offset y, width, height
    );

    if (callback) {
        callback();
    }

}

let date_to_render;
let date_in_gpu_buffer;
let date_in_final_render;

let phi_in_final_render;
let phi_to_render;

let composite_busy = false;
let canvas_busy = false;

let pointer;
let mouse;

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
        phi_to_render += delta.x / width * 2 * Math.PI;
        addAnimation(animate_canvas);
    }
}

function animate_composite() {
    // our work is done
    if (date_in_gpu_buffer == date_to_render) {
        removeAnimation(animate_composite);
    }
    // we have work to do
    else {

        diffEl.innerHTML = get_lag_string();

        // if not currently working on it
        if (!composite_busy) {
            composite_busy = true;
            render_composite(date_to_render, function() {
                composite_busy = false;
                date_in_gpu_buffer = date_to_render;
                addAnimation(animate_canvas);
            });
        }
    }
    // await the next scheduled animation
}

function animate_canvas() {
    // composite canvas is up to date and our work is done
    if ((phi_in_final_render == phi_to_render) && (date_in_final_render == date_in_gpu_buffer)) {
        removeAnimation(animate_canvas);
    }
    // not done
    else {
        // if not currently working on it
        if (!canvas_busy) {
            canvas_busy = true;
            transfer_to_canvas(phi_to_render, function() {
                canvas_busy = false;
                date_in_final_render = date_in_gpu_buffer;
                phi_in_final_render = phi_to_render;
            });
        }
    }
    // await next scheduled animation
}


function live_update() {

    let prev_date = date_to_render;
    let prev_phi = phi_to_render;

    date_to_render = new Date();
    phi_to_render = prev_phi - (Math.PI / (12 * 3600 * 1000) * (date_to_render.getTime() - prev_date.getTime()));

    addAnimation(animate_composite);
    setTimeout(live_update, live_update_interval);
}

function toggle_canvas() {
    let canvas = document.getElementById("canvas");
    let current = canvas.style.display;
    if (current == "block") {
        canvas.style.display = "none";
    } else {
        canvas.style.display = "block";
    }
}

function webgl_support () {
   try {
    var test_canvas = document.createElement('canvas');
    return !!window.WebGLRenderingContext &&
      (test_canvas.getContext('webgl') || test_canvas.getContext('experimental-webgl'));
   } catch(e) {
     return false;
   }
};

if (!webgl_support()) {

    loading_msg('GPU context is disabled. Aborting.');
    let a = document.createElement("a");
    a.href = "https://get.webgl.org/";
    a.innerHTML = "(More information)"
    loading_div.appendChild(a);
    document.getElementById("canvas").remove();

} else {

    onReady(function(){

        date_to_render = new Date();
        let hour = date_to_render.getUTCHours();
        let minutes = date_to_render.getUTCMinutes();

        // split at local ~4:00 am
        phi_to_render = -(4 * Math.PI / 6) - (hour + minutes /  60) / 12 * Math.PI;

        let canvas = document.getElementById("canvas");

        // initial render, delay for images to load.
        render_composite(
            date_to_render,
            function() {
                transfer_to_canvas(phi_to_render);

                canvas.style.display = "block";
                diffEl.innerHTML = get_lag_string();

                setTimeout(live_update, live_update_interval);
            }
        );

        lrmsgEl.addEventListener('touchstart', toggle_canvas);
        lrmsgEl.addEventListener('mousedown', toggle_canvas);

        document.onkeydown = function(evt) {
            evt = evt || window.event;
            var isEscape = false;
            if ("key" in evt) {
                isEscape = (evt.key === "Escape" || evt.key === "Esc");
            } else {
                isEscape = (evt.keyCode === 27);
            }
            if (isEscape) {
                toggle_canvas();
            }
        };


        canvas.addEventListener('touchstart', handleTouchstart);
        canvas.addEventListener('touchmove', handleTouchmove);
        canvas.addEventListener('mousedown', handleMousedown);
        canvas.addEventListener('mousemove', handleMousemove);

    });
}
