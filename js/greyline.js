// Rewritten to use
// https://github.com/cosinekitty/astronomy/tree/master/source/js

// document.getElementsByClassName('title')[0].remove();

// Backup from github version first
// Fix high precision. (I think when dropping nutation it was all good...)
// drop precession / nutation for moon as TODO

// I vaguely rememebr that phi for the sun wasn't correct because I was doing something wrong with longitude.
// use gpu.js https://gpu.rocks/#/ to render mask by compiling exiting math function with ``Math.`` added back
// use library for interpolation with 20-30 sun points 10-20 moon points instead of 100.

// change compositing method to paint mask:
// first paint image paints to SECOND CANVAS to allow wrapping rotation and drawImage

// all images exist in source; lazy load with src when needed

// render is single function that accepts positions, longitude offset
// solve_positions is single function that accepts date
// run is a single function that takes date, longitude offset body ()

// var offset_body;
// var offset_longitude;

const StorageKey = 'AstroDemo.Options';
function LoadOptions() {
    let options;
    try {
        options = JSON.parse(window.localStorage.getItem(StorageKey));
    } catch (e) {
    }

    if (!options) options = {};
    if (!IsValidNumber(options.latitude))  options.latitude  = '30';
    if (!IsValidNumber(options.longitude)) options.longitude = '-90';
    if (!IsValidNumber(options.elevation)) options.elevation = '0';
    if (typeof options.automatic !== 'boolean') options.automatic = true;
    if (!IsValidDate(options.date)) options.date = FormatDate(new Date());
    return options;
}
function SaveOptions() {
    try {
        window.localStorage.setItem(StorageKey, JSON.stringify(Options));
    } catch (e) {
    }
}

function solve_angle(target_date) {

    /* in milliseconds */
    const year = 1000 * 3600 * 24 * 365; // 1 year
    const month = 1000 * 3600 * 28; // 28 days
    const hist_length = 32; // number of points to make trail

    let bodies = {
        0: {name: 'Sun'},
        1: {name: 'Mercury'},
        2: {name: 'Venus'},
        3: {name: 'Moon'},
        4: {name: 'Mars'},
        5: {name: 'Jupiter'},
        6: {name: 'Saturn'},
        7: {name: 'Uranus'},
        8: {name: 'Neptune'}
    };
    let {[0]: sun, ...satellites} = bodies;
    let {[3]: moon, ...planets} = satellites;

    for (i in bodies) {
        bodies[i].hist = [];
    }

    // Sun
    let delta_t = month / hist_length;
    for (let j = 0; j < hist_length; j++) {

        let date = new Date(target_date.getTime() - delta_t * j);

        // Angle of prime meridian from equinox of date, converted to radians
        let sidereal_angle = Astronomy.SiderealTime(date) * Math.PI / 12.0;

        /// J2000 geocentric equatorial coordinates of the Sun [AU]
        let vec_epoch = Astronomy.GeoVector('Sun', date, aberration=true);

        /// rotation matrix from J2000 to Equatorial of date
        let rot = Astronomy.Rotation_EQJ_EQD(date);

        // Equatorial coordinates at target date (adjust for precession, nutation)
        let vec = Astronomy.RotateVector(rot, vec_epoch);

        sun.hist.push({
            polar_angle: Math.acos(vec.z / vec.Length()),
            longitude: Math.atan2(vec.y, vec.x) - sidereal_angle,
            date: date
        });

    }

    // Satellites
    delta_t = month / hist_length;
    for (let j = 0; j < hist_length; j++) {

        let date = new Date(target_date.getTime() - delta_t * j);

        // Angle of prime meridian from equinox of date, converted to radians
        let sidereal_angle = Astronomy.SiderealTime(date) * Math.PI / 12.0;

        /// rotation matrix from J2000 to Equatorial of date
        let rot = Astronomy.Rotation_EQJ_EQD(date);

        for (i in satellites) {

            /// J2000 geocentric equatorial coordinates of the satellite [AU]
            let vec_epoch = Astronomy.GeoVector(satellites[i].name, date, aberration=true);

            // Equatorial coordinates at target date (adjust for precession, nutation)
            let vec = Astronomy.RotateVector(rot, vec_epoch);

            satellites[i].hist.push({
                polar_angle: Math.acos(vec.z / vec.Length()),
                longitude: Math.atan2(vec.y, vec.x) - sidereal_angle,
                date: date
            });
        }
    }

    return bodies;
}


let pi = Math.PI, cos = Math.cos, sin = Math.sin, tan = Math.tan;
let asin = Math.asin, acos = Math.acos, sign = Math.sign, atan2 = Math.atan2;
let max = Math.max, min = Math.min, floor = Math.floor, abs = Math.abs;
let exp = Math.exp, sqrt = Math.sqrt;


let date = new Date();

function run(target_date) {

    let year = now.getYear();
    let month = now.getUTCMonth(); // [0, 12]
    let day = now.getUTCDate();
    let hour = now.getUTCHours();
    let minutes = now.getUTCMinutes();


    // load images
    let night = document.getElementById("night");
    // let pst_month_src = ("0" + (
    //     ((month + (day >= 15)) % 12) + 1 // [1, 12]
    // ).toString()).slice(-2);
    // let ftr_month_src = ("0" + (
    //     ((month + (day >= 15) + 1) % 12) + 1 // [1, 12]
    // ).toString()).slice(-2);
    let pst_month_src = "01";
    let ftr_month_src = "02";
    let pst_month = document.getElementById("month" + pst_month_src);
    let ftr_month = document.getElementById("month" + ftr_month_src);
    // pst_month.src = "/img/greyline/" + pst_month_src + ".jpg";
    // ftr_month.src = "/img/greyline/" + ftr_month_src + ".jpg";

    // interpolate between images based on time between months.
    // treat day 15 of month as center of month
    let monthAlpha; // weight of pst month
    if (day < 15) { // (day into ftr_month) [1, 14].
        monthAlpha = 0.5 * (16 - day) / 15; // [0.5, 1/15]
    } else { // (day of pst_month) [15, 31]
        monthAlpha = 0.5 * (1 + (31 - day) / 16); // [1, 0.5]
    }

    // set up canvas
    let canvas = document.getElementById("canvas");
    let ctx = canvas.getContext('2d');
    let dpi = window.devicePixelRatio;
    let style_width = Number(getComputedStyle(canvas).getPropertyValue("width").slice(0, -2));
    let style_height = Number(getComputedStyle(canvas).getPropertyValue("height").slice(0, -2));
    canvas.setAttribute('height', style_height * dpi);
    canvas.setAttribute('width', style_width * dpi);
    let w = canvas.width;
    let h = canvas.height;

    // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Compositing

    // light level proportional to (when positive)
    let mask = ctx.createImageData(w, h);
    // let underlay = ctx.createImageData(w, h);

    // account for atmospheric refraction
    // which is ~ 35 arc minutes
    let sunset_refrac = pi * (35 / 60) / 180;
    let sun_d = pi * 0.5 / 180 // angular diameter of sun

    // pretty fade
    let max_twilight = 0.5; // as bright as it gets after sunset
    let twilight_slope = 9 / pi; // rate of brightness fade in twilight

    let min_daylight = 0.6; // as dim as it gets while sun is visible
    let daylight_slope = 12 / pi; // rate of brightness fade in daylight

    let light; // lol @ biblical pun
    let lat, lng, xpx, ypx, phi, tha, dot, ang, x, area_sun, dark;

    let moon_sun_dot = sin(tha_sun[0]) * sin(tha_moon[0]) * cos(phi_sun[0] - phi_moon[0]) + cos(tha_moon[0]) * cos(tha_sun[0]);
    let moon_illum = ((1 - moon_sun_dot) / 2) ** 2;

    for (let i = 0; i < mask.data.length / 4; i += 1) {
        xpx = i % w;
        ypx = floor(i / w);
        phi = pi * (2 * xpx / w - 1); // [-pi, pi]
        tha = pi * (ypx / h); // [0, pi]

        // dot product in spherical polar, but theta is inverted
        // cos(tha) -> sin(tha) and vice-versa
        dot = sin(tha_sun[0]) * sin(tha) * cos(phi_sun[0] - phi) + cos(tha) * cos(tha_sun[0]);
        moon_dot = sin(tha_moon[0]) * sin(tha) * cos(phi_moon[0] - phi) + cos(tha) * cos(tha_moon[0]);

        // angle that sun appears above horizon
        // (for values near zero)
        ang = asin(dot) + sunset_refrac;

        // vertical coordinate of sun's center relative to horizon in solar radii
        x = min(max((ang - sun_d) / sun_d, -1), 1)

        // fraction of sun's area we can see from here
        area_sun = x * sqrt(1 - x ** 2) + asin(x) + (pi / 2)

        // discontinuous, piece-wise linear fade for sun
        if (area_sun > 0.99) {
            light = min_daylight + ang * daylight_slope;
        } else if (area_sun < 0.01) {
            light = max_twilight + dot * twilight_slope;
        } else {
            light = max_twilight + area_sun * (min_daylight - max_twilight);
        }

        // clamp values
        light = max(0, min(1, light));

        // account for moon
        if (moon_dot > 0) { // moon is visible
            light = light + moon_illum * moon_dot ** 2 * 0.5;
        }

        // clamp values again
        light = max(0, min(1, light));

        dark = (1 - light) * 255;

        mask.data[4 * i + 0] = 0;
        mask.data[4 * i + 1] = 0;
        mask.data[4 * i + 2] = 0;
        mask.data[4 * i + 3] = dark;

        // gets drawn behind night, in front of day
        // underlay.data[4 * i + 0] = 0;
        // underlay.data[4 * i + 1] = 0;
        // underlay.data[4 * i + 2] = 0;
        // underlay.data[4 * i + 3] = 0;

    }

    // x in [-0.5, 0.5]
    // y in [0, 1] (top, bottom)

    // Get x,y of sun
    let x_sun = [];
    let y_sun = [];
    for (let i = 0; i < sun_iter; i += 1) {
        x_sun[i] = (w / 2) * (1 + (phi_sun[i] / pi));
        y_sun[i] = h * tha_sun[i] / pi;
    }
    let sun_r = (w / (2 * pi)) * (sun_d / 2);

    // Get x,y of sun
    let x_moon = [];
    let y_moon = [];
    for (let i = 0; i < moon_iter; i += 1) {
        x_moon[i] = (w / 2) * (1 + (phi_moon[i] / pi));
        y_moon[i] = h * tha_moon[i] / pi;
    }
    let moon_r = sun_r;

    // Draw black region where night will go, fading into transparency at edges
    ctx.putImageData(mask, 0, 0);

    ctx.globalCompositeOperation = "source-in";

    // replace all black pixels with night-time image
    ctx.drawImage(night, 0, 0, w, h);

    function attempt_draw() {

        ctx.globalCompositeOperation = "destination-over";

        // draw underlay behind night-time image with appropriate transparency
        // ctx.globalAlpha = 0.5;
        // ctx.drawImage(underlay_bitmap, 0, 0, w, h);

        ctx.globalAlpha = monthAlpha;

        // draw day image from past month with appropriate transparency behind night and underlay
        ctx.drawImage(pst_month, 0, 0, w, h);

        ctx.globalAlpha = 1.0;

        // draw day image from next month with no transparency behind everything
        ctx.drawImage(ftr_month, 0, 0, w, h);

        ctx.globalCompositeOperation = "source-over";

        // draw moon, sun, and analemma on top of everything else

        // allow to wrap horizontally
        for (let i = -1; i < 2; i += 1){

            // reset parameters
            ctx.fillStyle = "#FFFFFFFF";
            ctx.strokeStyle = "#FFFFFFFF";
            ctx.lineWidth = 1;

            // draw sun
            ctx.beginPath();
            ctx.arc(x_sun[0] + (w * i), y_sun[0], sun_r, 0, 2 * pi);
            ctx.fill();
            // ctx.arc(x_sun[0] + (w * i), y_sun[0], sun_r + (ctx.lineWidth / 2), 0, 2 * pi);
            // ctx.stroke();

            // draw analemma
            for (let ii = 1; ii < sun_iter; ii += 1) {
                ctx.strokeStyle = 'rgba(255, 255, 255, ' + (1 - ii / sun_iter) * 0.7 + ')';
                ctx.beginPath();
                ctx.moveTo(x_sun[ii - 1] + (w * i), y_sun[ii - 1]);
                ctx.lineTo(x_sun[ii] + (w * i), y_sun[ii]);
                ctx.stroke();
            }

            ctx.fillStyle = "#AAAAAAFF";
            ctx.strokeStyle = "#AAAAAAFF";
            ctx.lineWidth = 0.5;

            // draw moon
            ctx.beginPath();
            ctx.arc(x_moon[0] + (w * i), y_moon[0], moon_r, 0, 2 * pi);
            ctx.fill();

            // draw lunar analemma
            for (let ii = 1; ii < moon_iter; ii += 1) {
                ctx.strokeStyle = 'rgba(170, 170, 170, ' + (1 - ii / moon_iter) * 0.7 + ')';
                ctx.beginPath();
                let start_x = x_moon[ii - 1] + (w * i);
                let stop_x = x_moon[ii] + (w * i);
                if ((stop_x - start_x) > w / 2) {
                    stop_x -= w;
                }
                ctx.moveTo(start_x, y_moon[ii - 1]);
                ctx.lineTo(stop_x, y_moon[ii]);
                ctx.stroke();
            }

        }
    }
}


onReady(function(){
    run(new Date());
});
