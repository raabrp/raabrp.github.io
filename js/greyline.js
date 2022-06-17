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

/* in milliseconds */
const year = 1000 * 3600 * 24 * 365;
const month = 1000 * 3600 * 28;
const hist_samples = 30;

/*
 * Get RA, DEC of each body
 */
function get_positions(date) {
    bodies = {
        0: {name: 'Sun', max_hist: year},
        1: {name: 'Mercury', max_hist: month},
        2: {name: 'Venus', max_hist: month},
        3: {name: 'Moon', max_hist: month},
        4: {name: 'Mars', max_hist: month},
        5: {name: 'Jupiter', max_hist: month},
        6: {name: 'Saturn', max_hist: month},
        7: {name: 'Uranus', max_hist: month},
        8: {name: 'Neptune', max_hist: month}
    };
    for (i in bodies) {
        bodies[i].hist = [];
        delta_t = bodies[i].max_hist / hist_samples;
        for (let j = 0; j < hist_samples; j++) {
            bodies[i].hist.push(
                Astronomy.GeoVector(
                    bodies[i].name,
                    new Date(date.getTime() - delta_t * j),
                    aberration=true
                )
            );
        }
    }
    console.log(bodies);
}

onReady(function(){
    get_positions(new Date());
});


// let pi = Math.PI, cos = Math.cos, sin = Math.sin, tan = Math.tan;
// let asin = Math.asin, acos = Math.acos, sign = Math.sign, atan2 = Math.atan2;
// let max = Math.max, min = Math.min, floor = Math.floor, abs = Math.abs;
// let exp = Math.exp, sqrt = Math.sqrt;

// function render(sun_pos, moon_pos) {
//     ;
// }


// function run(now) {

//     let month = now.getUTCMonth(); // [0, 12]
//     let day = now.getUTCDate();

//     // load images
//     let night = document.getElementById("night");
//     let pst_month_src = ("0" + (
//         ((month + (day >= 15)) % 12) + 1 // [1, 12]
//     ).toString()).slice(-2);
//     let ftr_month_src = ("0" + (
//         ((month + (day >= 15) + 1) % 12) + 1 // [1, 12]
//     ).toString()).slice(-2);
//     let pst_month = document.getElementById("month" + pst_month_src);
//     let ftr_month = document.getElementById("month" + ftr_month_src);
//     pst_month.src = "/img/greyline/" + pst_month_src + ".jpg";
//     ftr_month.src = "/img/greyline/" + ftr_month_src + ".jpg";

//     // TODO combine parallel workloads
//     pst_month.onload = function () {
//         ftr_month.onload = function () {
//             run_loaded(now);
//         };
//     };
// }

// function run_loaded(now) {

//     let year = now.getYear();
//     let month = now.getUTCMonth();
//     let day = now.getUTCDate();
//     let hour = now.getUTCHours();
//     let minutes = now.getUTCMinutes();

//     // interpolate between images based on time between months.
//     // treat day 15 of month as center of month
//     let monthAlpha; // weight of pst month
//     if (day < 15) { // (day into ftr_month) [1, 14].
//         monthAlpha = 0.5 * (16 - day) / 15; // [0.5, 1/15]
//     } else { // (day of pst_month) [15, 31]
//         monthAlpha = 0.5 * (1 + (31 - day) / 16); // [1, 0.5]
//     }

//     // set up canvas
//     let canvas = document.getElementById("canvas");
//     let ctx = canvas.getContext('2d');
//     let dpi = window.devicePixelRatio;

//     let style_width = Number(getComputedStyle(canvas).getPropertyValue("width").slice(0, -2));
//     let style_height = Number(getComputedStyle(canvas).getPropertyValue("height").slice(0, -2));

//     canvas.setAttribute('height', style_height * dpi);
//     canvas.setAttribute('width', style_width * dpi);

//     let w = canvas.width;
//     let h = canvas.height;

//     // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Compositing

//     // light level proportional to (when positive)
//     let mask = ctx.createImageData(w, h);
//     // let underlay = ctx.createImageData(w, h);

//     // account for atmospheric refraction
//     // which is ~ 35 arc minutes
//     let sunset_refrac = pi * (35 / 60) / 180;
//     let sun_d = pi * 0.5 / 180 // angular diameter of sun

//     // pretty fade

//     let max_twilight = 0.5; // as bright as it gets after sunset
//     let twilight_slope = 9 / pi; // rate of brightness fade in twilight

//     let min_daylight = 0.6; // as dim as it gets while sun is visible
//     let daylight_slope = 12 / pi; // rate of brightness fade in daylight

//     let light; // lol @ biblical pun
//     let lat, lng, xpx, ypx, phi, tha, dot, ang, x, area_sun, dark;

//     let moon_sun_dot = sin(tha_sun[0]) * sin(tha_moon[0]) * cos(phi_sun[0] - phi_moon[0]) + cos(tha_moon[0]) * cos(tha_sun[0]);
//     let moon_illum = ((1 - moon_sun_dot) / 2) ** 2;

//     for (let i = 0; i < mask.data.length / 4; i += 1) {
//         xpx = i % w;
//         ypx = floor(i / w);
//         phi = pi * (2 * xpx / w - 1); // [-pi, pi]
//         tha = pi * (ypx / h); // [0, pi]

//         // dot product in spherical polar, but theta is inverted
//         // cos(tha) -> sin(tha) and vice-versa
//         dot = sin(tha_sun[0]) * sin(tha) * cos(phi_sun[0] - phi) + cos(tha) * cos(tha_sun[0]);
//         moon_dot = sin(tha_moon[0]) * sin(tha) * cos(phi_moon[0] - phi) + cos(tha) * cos(tha_moon[0]);

//         // angle that sun appears above horizon
//         // (for values near zero)
//         ang = asin(dot) + sunset_refrac;

//         // vertical coordinate of sun's center relative to horizon in solar radii
//         x = min(max((ang - sun_d) / sun_d, -1), 1)

//         // fraction of sun's area we can see from here
//         area_sun = x * sqrt(1 - x ** 2) + asin(x) + (pi / 2)

//         // discontinuous, piece-wise linear fade for sun
//         if (area_sun > 0.99) {
//             light = min_daylight + ang * daylight_slope;
//         } else if (area_sun < 0.01) {
//             light = max_twilight + dot * twilight_slope;
//         } else {
//             light = max_twilight + area_sun * (min_daylight - max_twilight);
//         }

//         // clamp values
//         light = max(0, min(1, light));

//         // account for moon
//         if (moon_dot > 0) { // moon is visible
//             light = light + moon_illum * moon_dot ** 2 * 0.5;
//         }

//         // clamp values again
//         light = max(0, min(1, light));

//         dark = (1 - light) * 255;

//         mask.data[4 * i + 0] = 0;
//         mask.data[4 * i + 1] = 0;
//         mask.data[4 * i + 2] = 0;
//         mask.data[4 * i + 3] = dark;

//         // gets drawn behind night, in front of day
//         // underlay.data[4 * i + 0] = 0;
//         // underlay.data[4 * i + 1] = 0;
//         // underlay.data[4 * i + 2] = 0;
//         // underlay.data[4 * i + 3] = 0;

//     }

//     // x in [-0.5, 0.5]
//     // y in [0, 1] (top, bottom)

//     // Get x,y of sun
//     let x_sun = [];
//     let y_sun = [];
//     for (let i = 0; i < sun_iter; i += 1) {
//         x_sun[i] = (w / 2) * (1 + (phi_sun[i] / pi));
//         y_sun[i] = h * tha_sun[i] / pi;
//     }
//     let sun_r = (w / (2 * pi)) * (sun_d / 2);

//     // Get x,y of sun
//     let x_moon = [];
//     let y_moon = [];
//     for (let i = 0; i < moon_iter; i += 1) {
//         x_moon[i] = (w / 2) * (1 + (phi_moon[i] / pi));
//         y_moon[i] = h * tha_moon[i] / pi;
//     }
//     let moon_r = sun_r;

//     // Draw black region where night will go, fading into transparency at edges
//     ctx.putImageData(mask, 0, 0);

//     ctx.globalCompositeOperation = "source-in";

//     // replace all black pixels with night-time image
//     ctx.drawImage(night, 0, 0, w, h);

//     function attempt_draw() {

//         ctx.globalCompositeOperation = "destination-over";

//         // draw underlay behind night-time image with appropriate transparency
//         // ctx.globalAlpha = 0.5;
//         // ctx.drawImage(underlay_bitmap, 0, 0, w, h);

//         ctx.globalAlpha = monthAlpha;

//         // draw day image from past month with appropriate transparency behind night and underlay
//         ctx.drawImage(pst_month, 0, 0, w, h);

//         ctx.globalAlpha = 1.0;

//         // draw day image from next month with no transparency behind everything
//         ctx.drawImage(ftr_month, 0, 0, w, h);

//         ctx.globalCompositeOperation = "source-over";

//         // draw moon, sun, and analemma on top of everything else

//         // allow to wrap horizontally
//         for (let i = -1; i < 2; i += 1){

//             // reset parameters
//             ctx.fillStyle = "#FFFFFFFF";
//             ctx.strokeStyle = "#FFFFFFFF";
//             ctx.lineWidth = 1;

//             // draw sun
//             ctx.beginPath();
//             ctx.arc(x_sun[0] + (w * i), y_sun[0], sun_r, 0, 2 * pi);
//             ctx.fill();
//             // ctx.arc(x_sun[0] + (w * i), y_sun[0], sun_r + (ctx.lineWidth / 2), 0, 2 * pi);
//             // ctx.stroke();

//             // draw analemma
//             for (let ii = 1; ii < sun_iter; ii += 1) {
//                 ctx.strokeStyle = 'rgba(255, 255, 255, ' + (1 - ii / sun_iter) * 0.7 + ')';
//                 ctx.beginPath();
//                 ctx.moveTo(x_sun[ii - 1] + (w * i), y_sun[ii - 1]);
//                 ctx.lineTo(x_sun[ii] + (w * i), y_sun[ii]);
//                 ctx.stroke();
//             }

//             ctx.fillStyle = "#AAAAAAFF";
//             ctx.strokeStyle = "#AAAAAAFF";
//             ctx.lineWidth = 0.5;

//             // draw moon
//             ctx.beginPath();
//             ctx.arc(x_moon[0] + (w * i), y_moon[0], moon_r, 0, 2 * pi);
//             ctx.fill();

//             // draw lunar analemma
//             for (let ii = 1; ii < moon_iter; ii += 1) {
//                 ctx.strokeStyle = 'rgba(170, 170, 170, ' + (1 - ii / moon_iter) * 0.7 + ')';
//                 ctx.beginPath();
//                 let start_x = x_moon[ii - 1] + (w * i);
//                 let stop_x = x_moon[ii] + (w * i);
//                 if ((stop_x - start_x) > w / 2) {
//                     stop_x -= w;
//                 }
//                 ctx.moveTo(start_x, y_moon[ii - 1]);
//                 ctx.lineTo(stop_x, y_moon[ii]);
//                 ctx.stroke();
//             }

//         }
//     }
// }

// USE_STUPID_HIGH_PRECISION = false;

// function get_jce(jsdate) {
//     // Julian Date
//     // Tracks number of mean solar days since a standard epoch
//     //
//     // jsdate.getTime() yields POSIX time.
//     //
//     // POSIX time encodes UTC with ambiguity/invalidity only *during*
//     // leap seconds, otherwise providing a 1-1 mapping.
//     //
//     // For long intervals during which leap-seconds have occurred,
//     // POSIX time measures mean-solar-milliseconds since the POSIX Epoch.
//     // The POSIX epoch has a Julian date of 2440587.5
//     //
//     // For short intervals without leap seconds, unix-time nominally
//     // increments with SI seconds on the Earth's geoid (TT) as measured
//     // by TAI / GPS and synchronized using NTP.
//     //
//     // In general, UTC is kept within 0.9 seconds of UT1 by the coordinated
//     // use of leap-seconds. While we can thus track UT1 (and JD) using UTC,
//     // by losing track of how many leap seconds have been used, we suffer
//     // from cumulative drift relative to TAI / GPS / TT and cannot
//     // reconstruct precicely how many SI seconds (vs mean-solar seconds)
//     // have passed since a given epoch.
//     //
//     // There are 86400000.0 milliseconds per day
//     let JD = (jsdate.getTime() / 86400000.0 ) + 2440587.5;

//     // The cumulative addition of leap seconds is expected to increase
//     // with time due to tidal friction and even more once the poles stop
//     // melting. In general this quantity is difficult to predict
//     // TT - UT = Delta_T
//     //
//     // https://en.wikipedia.org/wiki/%CE%94T_(timekeeping)
//     //
//     let delta_t = 70; // seconds
//     let JDE = JD + (delta_t / 86400);

//     // Julian Centuries since J2000.0 Epoch
//     let JCE = (JDE - 2451545.0) / 36525.0;

//     return JCE;
// }

// function get_sun_pos(jce) {

//     // thata is current polar angle
//     // phi is current angle from vernal equinox
//     let x, y, z, etime;
//     if (USE_STUPID_HIGH_PRECISION) {
//         [theta, phi, etime] = get_high_precision_solar_angles(jce);
//     } else {
//         [theta, phi, etime] = get_solar_angles(jce);
//     }

//     return [theta, phi, etime];
//     ////////////////////////////////////////////////////////////////////////

// }

// function get_moon_pos(jce) {
//     let geo = getX2000_C(jce);

//     let epsilon = pi * (23.44 / 180);

//     let c = cos(epsilon), s = sin(epsilon);

//     // convert J2000.0 ecliptic geocentric cartesian
//     // to J2000.0 equatorial geocentric cartesian
//     let x = geo.X;
//     let y = geo.Y * c - geo.Z * s;
//     let z = geo.Y * s + geo.Z * c;
//     let r = geo.rGeo;

//     // convert J2000.0 equatorial to current equatorial
//     // (unused)
//     // let rm = ltp_PMAT(jce * 100);
//     // let xc = x * rm[0][0] + y * rm[0][1] + z * rm[0][2];
//     // let yc = x * rm[1][0] + y * rm[1][1] + z * rm[1][2];
//     // let zc = x * rm[2][0] + y * rm[2][1] + z * rm[2][2];

//     let tha = acos(z / r);   // polar angle
//     let phi = atan2(y, x);  // longitude

//     return [tha, phi];

// }

// // Convert degree angle to radians
// function degToRad(angleDeg) {
//     return (pi * (angleDeg % 360) / 180.0);
// }


// function get_solar_angles(t) {
//     /*
//      * Adapted from https://www.esrl.noaa.gov/gmd/grad/solcalc/main.js
//      */

//     // Mean Longitude of Sun in degrees to second order approximation
//     let l0 = 280.46646 + t * (36000.76983 + t * (0.0003032));

//     // Mean Anomaly of Sun in radians to second order approximation
//     let m = degToRad(357.52911 + t * (35999.05029 - 0.0001537 * t));

//     // Sun's Equation of the Center in degrees
//     // is approximation for orbits with small eccentricity
//     // as opposed to solving Kepler's equation
//     let c =
//         sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
//         sin(m+m) * (0.019993 - 0.000101 * t) +
//         sin(m+m+m) * 0.000289;

//     // True Longitude of Sun in degrees
//     let ltrue = l0 + c

//     // correction for nutation and aberration in radians
//     let omega = degToRad(125.04 - 1934.136 * t);

//     // Apparent Longitude of Sun in radians
//     let lambda = degToRad(ltrue - 0.00569 - 0.00478 * sin(omega));

//     // Mean Obliquity of Ecliptic in degrees
//     // to third order approximation
//     let seconds = 21.448 - t*(46.8150 + t*(0.00059 - t*(0.001813)));
//     let e0 = 23.0 + (26.0 + (seconds / 60.0)) / 60.0;

//     // True obliquity in radians corrected for parallax
//     let epsilon = degToRad(e0 + 0.00256 * cos(omega));

//     // Right Ascension in radians
//     let atan_num = cos(epsilon) * sin(lambda);
//     let atan_denom = cos(lambda);
//     let alpha = atan2(atan_num, atan_denom);

//     // Declination in radians
//     let sindec = sin(epsilon) * sin(lambda);
//     let dec = asin(sindec);

//     // polar angle in radians
//     let tha = (pi / 2) - dec;
//     let sintha = sin(tha);
//     let costha = cos(tha);

//     // Equation of Time

//     let yy = tan(epsilon/2.0);
//     yy *= yy;

//     let l0r = degToRad(l0);
//     let sin2l0 = sin(2.0 * l0r);
//     let sinm   = sin(m);
//     let cos2l0 = cos(2.0 * l0r);
//     let sin4l0 = sin(4.0 * l0r);
//     let sin2m  = sin(2.0 * m);

//     // eccentricity of Earth's orbit
//     let e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

//     let etime = yy * sin2l0 - 2.0 * e * sinm + 4.0 * e * yy * sinm * cos2l0
//             - 0.5 * yy * yy * sin4l0 - 1.25 * e * e * sin2m;

//     // equatorial J2000.0 unit vector
//     let p = sqrt(atan_denom ** 2 + atan_num ** 2);
//     let x = atan_denom * sintha / p;
//     let y = atan_num * sintha / p;
//     let z = costha;

//     // convert J2000.0 equatorial to current equatorial
//     // (unused, from precession.js)
//     // let rm = ltp_PMAT(t * 100);
//     // let xc = x * rm[0][0] + y * rm[0][1] + z * rm[0][2];
//     // let yc = x * rm[1][0] + y * rm[1][1] + z * rm[1][2];
//     // let zc = x * rm[2][0] + y * rm[2][1] + z * rm[2][2];

//     tha = acos(z);           // polar angle
//     let phi = atan2(y, x);   // longitude

//     return [tha, phi, etime];

// }

// onReady(function(){
//     run(new Date());
// });
