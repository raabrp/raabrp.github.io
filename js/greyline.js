// Rewritten to use
// https://github.com/cosinekitty/astronomy/tree/master/source/js

celestial_objects = {
    0: {name: 'Sun', linewidth: 3},
    1: {name: 'Mercury', linewidth: 0.5},
    2: {name: 'Venus', linewidth: 2.5},
    3: {name: 'Moon', linewidth: 3},
    4: {name: 'Mars', linewidth: 2},
    5: {name: 'Jupiter', linewidth: 2.5},
    6: {name: 'Saturn', linewidth: 2.5},
    7: {name: 'Uranus', linewidth: 0.5},
    8: {name: 'Neptune', linewidth: 0.5}
};

let global_hist_length = 20;
let global_interpolation_segments = 20;

// For bezier interpolation, we aren't plotting the end-points, so we generate
// one future point with index 0, and the target date is at index 1
function solve_angles(target_date) {

    /* in milliseconds */
    const day = 1000 * 3600 * 24 // solar day in milliseconds
    const year = day * 365.25; // 1 year
    const month = day * 28; // 28 days
    const hist_length = global_hist_length;
    const sidereal_day = 86164.0905 // seconds
    // treat the earth as if it's rotating only the difference between
    // a sidereal day and a solar day, per (solar) day.
    const ratio = 3600 * 24 / sidereal_day;
    const omega = ratio * (ratio - 1) * 2 * Math.PI; // radians per day

    let bodies = celestial_objects;
    let {[0]: sun, ...satellites} = bodies;
    let {[3]: moon, ...planets} = satellites;

    for (i in bodies) {
        bodies[i].hist = [];
    }

    // Angle of prime meridian from equinox of date, converted to radians
    let init_sidereal_angle = Astronomy.SiderealTime(target_date) * Math.PI / 12.0;

    // Sun
    let delta_t = year / hist_length;
    for (let j = -1; j < hist_length - 1; j++) {

        let date = new Date(target_date.getTime() - delta_t * j);

        // Angle of prime meridian from equinox of date, converted to radians
        let sidereal_drift = init_sidereal_angle - omega * delta_t * j / day;

        /// J2000 geocentric equatorial coordinates of the Sun [AU]
        let vec_epoch = Astronomy.GeoVector('Sun', date, aberration=true);

        /// rotation matrix from J2000 to Equatorial of date
        let rot = Astronomy.Rotation_EQJ_EQD(date);

        // Equatorial coordinates at target date (adjust for precession, nutation)
        let vec = Astronomy.RotateVector(rot, vec_epoch);

        sun.hist.push({
            polar_angle: Math.acos(vec.z / vec.Length()),
            longitude: Math.atan2(vec.y, vec.x) - sidereal_drift,
            date: date
        });

    }

    // Satellites
    delta_t = month / hist_length;
    for (let j = -1; j < hist_length - 1; j++) {

        let date = new Date(target_date.getTime() - delta_t * j);

        // correct for discrepancy between solar and sidereal time
        let sidereal_drift = init_sidereal_angle - omega * delta_t * j / day;

        /// rotation matrix from J2000 to Equatorial of date
        let rot = Astronomy.Rotation_EQJ_EQD(date);

        for (i in satellites) {

            /// J2000 geocentric equatorial coordinates of the satellite [AU]
            let vec_epoch = Astronomy.GeoVector(satellites[i].name, date, aberration=true);

            // Equatorial coordinates at target date (adjust for precession, nutation)
            let vec = Astronomy.RotateVector(rot, vec_epoch);

            satellites[i].hist.push({
                polar_angle: Math.acos(vec.z / vec.Length()),
                longitude: Math.atan2(vec.y, vec.x) - sidereal_drift,
                date: date
            });
        }
    }

    return bodies;
}

// resolution of NASA images
const width = 3600;
const height = 1800;

// https://github.com/gpujs/gpu.js/#alpha
const gpu_canvas = document.createElement('canvas');
gpu_canvas.width = width;
gpu_canvas.height = height;
const gpu_gl = gpu_canvas.getContext('webgl2', { premultipliedAlpha: false });
const gpu = new GPU({
    gpu_canvas,
    context: gpu_gl
});

// tha is theta (north polar angle)
// phi is longitude
const gpu_render = gpu.createKernel(function (tha_sun, phi_sun, tha_moon, phi_moon) {
    // compute amount of light in [0, 1]
    // falling on the surface of earth at given polar angle (tha) and longitude (phi)
    // just a rough calculation that sacrifices correctness for
    // reasonable graphical quality
    // returned color represents the *absence* of light

    let light = 1; // biblical pun

    const width = 3600;
    const height = 1800;

    let phi = (2 * this.thread.x / width - 1) * Math.PI; // [-pi, pi]

    // y is given to us from bottom of image, contrary to normal graphics coordinates.
    let tha = (1 - this.thread.y / height) * Math.PI;    // [0, pi]

    // dot products in spherical polar coordinates
    let moon_sun_dot = Math.sin(tha_sun) * Math.sin(tha_moon) * Math.cos(phi_sun - phi_moon) + Math.cos(tha_moon) * Math.cos(tha_sun);
    let sun_dot = Math.sin(tha_sun) * Math.sin(tha) * Math.cos(phi_sun - phi) + Math.cos(tha) * Math.cos(tha_sun);
    let moon_dot = Math.sin(tha_moon) * Math.sin(tha) * Math.cos(phi_moon - phi) + Math.cos(tha) * Math.cos(tha_moon);

    // how much light to add from moon
    let moon_illum = ((1 - moon_sun_dot) / 2) ** 2; // [0, 1]

    // account for atmospheric refraction for sunset
    let sunset_refrac = Math.PI * (35 / 60) / 180; // sun visible 35 arc minutes past geometric setting
    let sun_diameter = Math.PI * 0.5 / 180; // angular diameter of sun

    // angle that sun appears above horizon (for values near zero)
    let sun_horizon_angle = Math.asin(sun_dot) + sunset_refrac;

    // vertical coordinate of sun's center relative to horizon in solar radii
    let x = Math.min(Math.max((sun_horizon_angle - sun_diameter) / sun_diameter, -1), 1)

    // fraction of sun's area we can see from here
    let visible_sun_area = x * sqrt(1 - x ** 2) + Math.asin(x) + (Math.PI / 2)

    // discontinuous, piece-wise linear fade for sun
    let max_twilight = 0.5; // as bright as it gets after sunset
    let twilight_slope = 9 / Math.PI; // rate of brightness fade in twilight

    let min_daylight = 0.6; // as dim as it gets while sun is visible
    let daylight_slope = 12 / Math.PI; // rate of brightness fade in daylight


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

    this.color(1, 0, 0, (1 - light));

})
    .setOutput([width, height])
    .setGraphical(true);

compositing_canvas = document.createElement('canvas');
compositing_canvas.width = width;
compositing_canvas.height = height;
compositing_ctx = compositing_canvas.getContext('2d');

function month_str(month) { // [0, 11]
    return  ("0" + (((month + 12) % 12) + 1).toString()).slice(-2); // [01, 12]
}
function month_src(month) {
    return "/img/greyline/" + month_str(month) + ".jpg"
}
function month_img(month) {
    return document.getElementById("month" + month_str(month));
}
function month_is_loaded(month) { // [0, 11]
    let this_month_src = month_src(month);
    let this_month_img = month_img(month);

    return (
        this_month_img.dataset.touched && this_month_img.complete
    );
}

function render_composite(date, callback, wait_for_img_load=false) {
    /*
     * date: date object
     * */

    let bodies = solve_angles(date);
    let {[0]: sun, ...satellites} = bodies;
    let {[3]: moon, ...planets} = satellites;

    gpu_render(
        sun.hist[1].polar_angle, // use index 1 for target date because index 0 is a future point
        sun.hist[1].longitude,
        moon.hist[1].polar_angle,
        moon.hist[1].longitude
    );

    let year = date.getYear();
    let month = date.getUTCMonth(); // [0, 11]
    let day = date.getUTCDate();

    // interpolate between images based on time between months.
    // treat day 15 of month as center of month
    let monthAlpha; // weight of pst_month
    let pst_month;
    let ftr_month;
    let pst_month_img;
    let ftr_month_img;

    if (day < 15) {
        pst_month = month - 1;
        ftr_month = month;
        monthAlpha = 0.5 * (15 - day) / 14; // [1, 14] -> [0.5, 1/28]
    } else {
        pst_month = month;
        ftr_month = month + 1;
        monthAlpha = 0.5 * (1 + (31 - day) / 16); // [15, 31] -> [1, 0.5]
    }

    // get image elements
    pst_month_img = month_img(pst_month);
    ftr_month_img = month_img(ftr_month);

    // trigger image load if not already loaded
    if (!pst_month_img.dataset.touched) {
        pst_month_img.src = month_src(pst_month);
        pst_month_img.dataset.touched = true;
    }
    if (!ftr_month_img.dataset.touched) {
        ftr_month_img.src = month_src(ftr_month);
        ftr_month_img.dataset.touched = true;
    }

    if (wait_for_img_load) {
        images_to_load = new Set;

        for (img of [pst_month_img, ftr_month_img, night]) {
            if (!img.complete) {
                images_to_load.add(img);
                img.onload = function() { handle_image_load(this); };
            }
        }
        function handle_image_load(img) {
            images_to_load.delete(img);
            if (images_to_load.size == 0) {
                draw();
            }
        }
        handle_image_load();
    } else {
        // assume night is already loaded.
        if (month_is_loaded(pst_month) && month_is_loaded(ftr_month)) {
            draw();
        }
        else {
            let found_month = pst_month;
            let test_month;

            function look_forward() {
                test_month = pst_month;
                if (month_is_loaded(pst_month += 1)) {
                    found_month = pst_month;
                    return true;
                }
            }
            function look_back() {
                test_month = ftr_month;
                if (month_is_loaded(ftr_month -= 1)) {
                    found_month = ftr_month;
                    return true;
                }
            }

            while (!(look_forward() || look_back())) {
                if (test_month <= -11) { break; } // we've looped
            }

            pst_month = found_month;
            ftr_month = found_month;

            draw();
        }
    }

    function draw() {
        compose_image_layers(pst_month, ftr_month, monthAlpha);
        draw_celestial_bodies(bodies);
        if (callback) {
            callback();
        }
    }
}

function compose_image_layers(pst_month, ftr_month, monthAlpha) {

    // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Compositing

    compositing_ctx.globalCompositeOperation = "source-over";

    compositing_ctx.globalAlpha = 1;
    compositing_ctx.drawImage(month_img(ftr_month), 0, 0, width, height);
    compositing_ctx.globalAlpha = monthAlpha;
    compositing_ctx.drawImage(month_img(pst_month), 0, 0, width, height);

    // delete dark pixels
    compositing_ctx.globalAlpha = 1;
    compositing_ctx.globalCompositeOperation = "destination-out";
    compositing_ctx.drawImage(gpu_canvas, 0, 0, width, height);

    // place night image behind
    compositing_ctx.globalCompositeOperation = "destination-over";
    compositing_ctx.drawImage(night, 0, 0, width, height);

    compositing_ctx.globalCompositeOperation = "source-over";

}

function draw_celestial_bodies(bodies) {

    for (idx in bodies) {
        body = bodies[idx];

        // get pixel coordinates
        let xs = [];
        let ys = [];

        for (position of body.hist) {

            let x = (width / 2) * (position.longitude / Math.PI + 1);
            let y = height * (position.polar_angle / Math.PI);

            xs.push(x);
            ys.push(y);
        }

        // patch discontinuities due to angle wrapping
        // and combine xs and ys into single array
        xs[0] = (xs[0] + 2 * width) % width;
        points = [];
        hist_length = xs.length;
        for (i = 1; i < hist_length; i += 1) {
            while (xs[i] - xs[i - 1] > (width / 2)) {
                xs[i] -= width;
            }
            while (xs[i] - xs[i - 1] < -(width / 2)) {
                xs[i] += width;
            }
            points.push(xs[i]);
            points.push(ys[i]);
        }

        let points_interpolated = getCurvePoints(points, 0.5); // [[x0, y0, x1, y1], tension, numOfSeg
        let xs_interpolated = [];
        let ys_interpolated = [];
        for (i = 0; i < points_interpolated.length / 2; i += 1) {
            xs_interpolated.push(points_interpolated[2 * i]);
            ys_interpolated.push(points_interpolated[2 * i + 1]);
        }

        // allow to wrap horizontally
        for (let i = -1; i < 2; i += 1){
            let width_offset = width * i;

            // reset parameters
            compositing_ctx.fillStyle = "#FFFFFFFF";
            compositing_ctx.strokeStyle = "#FFFFFFFF";
            compositing_ctx.lineWidth = body.linewidth;

            // draw analemma
            interpolated_length = xs_interpolated.length;
            for (ii = 1; ii < interpolated_length; ii += 1) {
                compositing_ctx.strokeStyle = 'rgba(255, 255, 255, ' + (1 - (ii / interpolated_length)) + ')';

                compositing_ctx.beginPath();
                compositing_ctx.moveTo(xs_interpolated[ii - 1] + width_offset, ys_interpolated[ii - 1]);
                compositing_ctx.lineTo(xs_interpolated[ii] + width_offset, ys_interpolated[ii]);
                compositing_ctx.stroke();
            }
        }
    }
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
        compositing_canvas,
        0, 0, phi_offset, height,                  // source offset x, offset y, width, height
        width - phi_offset, 0, phi_offset, height  // dest offset x, offset y, width, height
    );
    ctx.drawImage(
        compositing_canvas,
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

let dateEl = document.getElementById("date");

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

    handle_interface({ x: dx, y: dy });

    touch = { x: x, y: y };

}

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

    if (delta.y) {
        // fire up animate_composite if not already running.
        // it will run at least twice,
        // triggering animate_canvas after the first run.
        let delta_t = Math.round(delta.y / 10) * 1000 * 3600 * 24
        date = new Date(date.getTime() + delta_t);
        addAnimation(animate_composite);
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
                dateEl.innerHTML = date.toUTCString();
                phi_in_image = phi;
            });
        }
    }
    // await next scheduled animation
}

live_update_interval = 1000 * 12; // 12 seconds = 0.5 pixel at 3600 px width

function live_update() {
    date = new Date(date.getTime() + live_update_interval);
    addAnimation(animate_composite);
    setTimeout(live_update, live_update_interval);
}

onReady(function(){

    date = new Date();
    let hour = date.getUTCHours();
    let minutes = date.getUTCMinutes();

    phi = Math.PI - (hour + minutes /  60) / 12 * Math.PI;

    // initial render, delay for images to load.
    render_composite(
        date,
        callback=function() {
            transfer_to_canvas(phi);
            setTimeout(live_update, live_update_interval);
            dateEl.innerHTML = date.toUTCString();
        },
        wait_for_img_load=true
    );

    let canvas = document.getElementById("canvas");
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('touchstart', handleTouchstart);
    canvas.addEventListener('touchmove', handleTouchmove);
    canvas.addEventListener('mousedown', handleMousedown);
    canvas.addEventListener('mousemove', handleMousemove);
    canvas.addEventListener('touchstart', handleTouchstart);

    // continually update time and phi synchronously

});
