
function calcSun(jsdate)
{

    // Approximate UT1 with UTC
    // number of Julian Centuries since J2000.0 Epoch
    var t = ((jsdate.getTime() / 86400000.0 ) + 2440587.5 - 2451545.0) / 36525.0;

    // Mean Longitude of Sun in degrees to second order approximation
    var l0 = (280.46646 + t * (36000.76983 + t*(0.0003032)) % 360)

    // Mean Anomaly of Sun in radians to second order approximation
    var m = degToRad((357.52911 + t * (35999.05029 - 0.0001537 * t)) % 360);

    // Sun's Equation of the Center in degrees
    // is approximation for orbits with small eccentricity
    // as opposed to solving Kepler's equation
    var c =
        Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
        Math.sin(m+m) * (0.019993 - 0.000101 * t) +
        Math.sin(m+m+m) * 0.000289;

    // True Longitude of Sun in degrees
    var ltrue = l0 + c

    // correction for nutation and aberration in radians
    var omega = degToRad(125.04 - 1934.136 * t);

    // Apparent Longitude of Sun in radians
    var lambda = degToRad(ltrue - 0.00569 - 0.00478 * Math.sin(omega));

    // Mean Obliquity of Ecliptic in degrees
    // to third order approximation
    var seconds = 21.448 - t*(46.8150 + t*(0.00059 - t*(0.001813)));
    var e0 = 23.0 + (26.0 + (seconds/60.0))/60.0;

    // Obliquity in radians corrected for parallax
    var epsilon = degToRad(e0 + 0.00256 * Math.cos(omega));


    // eccentricity of Earth's orbit
    var e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

    // Right Ascension in radians
    // var tananum = Math.cos(epsilon) * Math.sin(lambda);
    // var tanadenom = Math.cos(lambda);
    // var alpha = Math.atan2(tananum, tanadenom);

    // Equation of Time
    var y = Math.tan(epsilon/2.0);
    y *= y;

    var l0r = degToRad(l0);
    var sin2l0 = Math.sin(2.0 * l0);
    var sinm   = Math.sin(m);
    var cos2l0 = Math.cos(2.0 * l0);
    var sin4l0 = Math.sin(4.0 * l0);
    var sin2m  = Math.sin(2.0 * m);

    var Etime = y * sin2l0 - 2.0 * e * sinm + 4.0 * e * y * sinm * cos2l0
            - 0.5 * y * y * sin4l0 - 1.25 * e * e * sin2m;

    // Declination in radians
    var sint = Math.sin(epsilon) * Math.sin(lambda);
    var theta = Math.asin(sint);

    return [Etime, theta];
}

// Convert degree angle to radians
function degToRad(angleDeg) 
{
    return (Math.PI * angleDeg / 180.0);
}
