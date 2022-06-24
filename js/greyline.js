// Rewritten to use
// https://github.com/cosinekitty/astronomy/tree/master/source/js

celestial_objects = {
    0: {name: 'Sun', linewidth: 3},
    1: {name: 'Mercury', linewidth: 1},
    2: {name: 'Venus', linewidth: 2},
    3: {name: 'Moon', linewidth: 3},
    4: {name: 'Mars', linewidth: 2},
    5: {name: 'Jupiter', linewidth: 2},
    6: {name: 'Saturn', linewidth: 2},
    7: {name: 'Uranus', linewidth: 1},
    8: {name: 'Neptune', linewidth: 1}
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

function render_composite(date, callback) {
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
    let month = date.getUTCMonth(); // [0, 12]
    let day = date.getUTCDate();

    let pst_month_src = ("0" + (
        ((month + (day >= 15)) % 12) + 1 // [1, 12]
    ).toString()).slice(-2);
    let ftr_month_src = ("0" + (
        ((month + (day >= 15) + 1) % 12) + 1 // [1, 12]
    ).toString()).slice(-2);

    let pst_month = document.getElementById("month" + pst_month_src);
    let ftr_month = document.getElementById("month" + ftr_month_src);
    pst_month.src = "/img/greyline/" + pst_month_src + ".jpg";
    ftr_month.src = "/img/greyline/" + ftr_month_src + ".jpg";

    // interpolate between images based on time between months.
    // treat day 15 of month as center of month
    let monthAlpha; // weight of pst month
    if (day < 15) { // (day into ftr_month) [1, 14].
        monthAlpha = 0.5 * (16 - day) / 15; // [0.5, 1/15]
    } else { // (day of pst_month) [15, 31]
        monthAlpha = 0.5 * (1 + (31 - day) / 16); // [1, 0.5]
    }

    images_to_load = new Set;
    function handle_image_load(img) {

        images_to_load.delete(img);
        if (images_to_load.size == 0) {
            draw();
        }
    }
    for (img of [pst_month, ftr_month, night]) {
        if (!img.complete) {
            images_to_load.add(img);
            img.onload = function() { handle_image_load(this); };
        }
    }
    handle_image_load();

    function draw() {
        compose_image_layers();
        draw_celestial_bodies();
        if (callback) {
            callback();
        }
    }

    function compose_image_layers() {

        // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Compositing

        compositing_ctx.globalCompositeOperation = "source-over";

        compositing_ctx.globalAlpha = 1;
        compositing_ctx.drawImage(ftr_month, 0, 0, width, height);
        compositing_ctx.globalAlpha = monthAlpha;
        compositing_ctx.drawImage(pst_month, 0, 0, width, height);

        // delete dark pixels
        compositing_ctx.globalAlpha = 1;
        compositing_ctx.globalCompositeOperation = "destination-out";
        compositing_ctx.drawImage(gpu_canvas, 0, 0, width, height);

        // place night image behind
        compositing_ctx.globalCompositeOperation = "destination-over";
        compositing_ctx.drawImage(night, 0, 0, width, height);

        compositing_ctx.globalCompositeOperation = "source-over";

    }

    function draw_celestial_bodies() {

        for (idx in bodies) {
            body = bodies[idx];

            // get pixel coordinates
            xs = [];
            ys = [];

            for (position of body.hist) {

                let x = (width / 2) * (position.longitude / Math.PI + 1);
                let y = height * (position.polar_angle / Math.PI);

                xs.push(x);
                ys.push(y);
            }

            // patch discontinuities due to angle wrapping
            // and combine xs and ys into single array
            points = [];
            hist_length = xs.length;
            for (i = 1; i < hist_length; i += 1) {
                if (xs[i] - xs[i - 1] > (width / 2)) {
                    xs[i] -= width;
                }
                else if (xs[i] - xs[i - 1] < -(width / 2)) {
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
}

function transfer_to_canvas(phi) {
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

}


onReady(function(){

    let date = new Date();
    let hour = date.getUTCHours();
    let minutes = date.getUTCMinutes();
    let phi = Math.PI - (hour + minutes /  60) / 12 * Math.PI;

    let canvas = document.getElementById("canvas");

    var handleWheel = function(e) {
        e.preventDefault();
        phi += e.deltaX / 1000;

        // TODO HERE: rate-limited time update.
        // if (e.deltaY) {
        //     let date = new Date(target_date.getTime() - delta_t * j);
        // }
        //
        // also TODO. Reimplement ability to pause animations
    };

    canvas.addEventListener('wheel', handleWheel);

    render_composite(date, init_callback);

    function animate() {
        transfer_to_canvas(phi);
    }

    function init_callback() {
        addAnimation(animate);
    }

});
