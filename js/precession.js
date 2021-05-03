let SQRT = Math.sqrt;
let SIN = Math.sin;
let COS = Math.cos;
let MAX = Math.max;

// Arcseconds to radians
let AS2R = 4.848136811095359935899141e-6;

// 2 pi
let D2PI = 6.283185307179586476925287;

// obliquity at J2000.0 (radians)
let EPS0 = 84381.406 * AS2R;

// precession of the ecliptic.
function ltp_PECL( EPJ ) {
    /*
     * Long-term precession of the ecliptic.
     * Given:
     *  EPJ d Julian epoch (TT)
     * Returned:
     *  VEC d ecliptic pole unit vector
     *
     * The vector is with respect to the J2000.0 mean equator and equinox.
     *
     * Reference: Vondrak et al., A&A (2011), Eq.8, Tab.1
     *
     * Date: 2011 May 14
     * Authors: J.Vondrak, N.Capitaine, P.Wallace
     *
     */

    let VEC = [];

    // Number of polynomial terms
    let NPOL = 4;

    // Number of periodic terms
    let NPER = 8;

    // misc
    let I, J, T, P, Q, W, A, S, C, Z;

    // Polynomial and periodic coefficients

    let PQPOL = [
        [5851.607687,
           -0.1189000,
           -0.00028913,
            0.000000101],

       [-1600.886300,
            1.1689818,
           -0.00000020,
           -0.000000437]
    ];

    let PQPER = [
        [708.15,        -5486.751211,        -684.661560,
                          667.666730,       -5523.863691],
        [2309.00,         -17.127623,        2446.283880,
                        -2354.886252,        -549.747450],
        [1620.00,        -617.517403,         399.671049,
                         -428.152441,        -310.998056],
        [492.20,          413.442940,        -356.652376,
                          376.202861,         421.535876],
        [1183.00,          78.614193,        -186.387003,
                          184.778874,         -36.776172],
        [622.00,         -180.732815,        -316.800070,
                          335.321713,        -145.278396],
        [882.00,          -87.676083,         198.296071,
                         -185.138669,         -34.744450],
        [547.00,           46.140315,         101.135679,
                         -120.972830,          22.885731]
    ];

    // Centuries since J2000.
    T = (EPJ - 2000) / 100;
    W = D2PI * T;

    // Initialize P_A and Q_A accumulators.
    P = 0;
    Q = 0;

    // Periodic terms.
    for(I=0; I < NPER; I++) {
        A = W / PQPER[I][0];
        S = SIN(A);
        C = COS(A);
        P = P + C * PQPER[I][1] + S * PQPER[I][3];
        Q = Q + C * PQPER[I][2] + S * PQPER[I][4];
    }
    // Polynomial terms.
    W = 1
    for (I=0; I < NPOL; I++) {
        P = P + PQPOL[0][I] * W;
        Q = Q + PQPOL[1][I] * W;
        W = W * T;
    }

    // P_A and Q_A (radians).
    P = P * AS2R;
    Q = Q * AS2R;

    // Form the ecliptic pole vector.
    Z = SQRT(MAX(1 - P * P - Q * Q, 0))
    S = SIN(EPS0);
    C = COS(EPS0);
    VEC[0] = P;
    VEC[1] = - Q * C - Z * S;
    VEC[2] = - Q * S + Z * C;

    return VEC;
}

// Precession of the equator
function ltp_PEQU( EPJ ) {
    /*
     * Long-term precession of the equator.
     *
     * Given:
     *   EPJ d Julian epoch (TT)
     *
     * Returned:
     *   VEQ d equator pole unit vector
     *
     * The vector is with respect to the J2000.0 mean equator and equinox.
     *
     * Reference: Vondrak et al., A&A (2011), Eq.9, Tab.2
     *
     * Date: 2011 May 14
     * Authors: J.Vondrak, N.Capitaine, P.Wallace
     */

    let VEQ = [];

    // num polynomial terms
    let NPOL = 4;

    // num periodic terms
    let NPER = 14;

    // Miscellaneous

    let I, J, T, X, Y, W, A, S, C;

    // Polynomial and periodic coefficients
    let XYPOL = [
        [5453.282155,
            0.4252841,
           -0.00037173,
           -0.000000152],

      [-73750.930350,
           -0.7675452,
           -0.00018725,
            0.000000231]
    ];
    let  XYPER = [
        [256.75,     -819.940624,     75004.344875,
                    81491.287984,      1558.515853],
        [708.15,    -8444.676815,       624.033993,
                      787.163481,      7774.939698],
        [274.20,     2600.009459,      1251.136893,
                     1251.296102,     -2219.534038],
        [241.45,     2755.175630,     -1102.212834,
                    -1257.950837,     -2523.969396],
        [2309.00,    -167.659835,     -2660.664980,
                    -2966.799730,       247.850422],
        [492.20,      871.855056,       699.291817,
                      639.744522,      -846.485643],
        [396.10,       44.769698,       153.167220,
                      131.600209,     -1393.124055],
        [288.90,     -512.313065,      -950.865637,
                     -445.040117,       368.526116],
        [231.10,     -819.415595,       499.754645,
                      584.522874,       749.045012],
        [1610.00,    -538.071099,      -145.188210,
                      -89.756563,       444.704518],
        [620.00,     -189.793622,       558.116553,
                      524.429630,       235.934465],
        [157.87,     -402.922932,       -23.923029,
                      -13.549067,       374.049623],
        [220.30,      179.516345,      -165.405086,
                     -210.157124,      -171.330180],
        [1200.00,     -9.814756,          9.344131,
                     -44.919798,        -22.899655]
    ];

    // Centuries since J2000.
    T = (EPJ - 2000) / 100;

    // Initialize X and Y accumulators.
    X = 0;
    Y = 0;

    //  Periodic terms.
    for (I=0; I < NPER; I++) {
        W = D2PI * T;
        A = W / XYPER[I][0];
        S = SIN(A);
        C = COS(A);
        X = X + C * XYPER[I][1] + S * XYPER[I][3];
        Y = Y + C * XYPER[I][2] + S * XYPER[I][4];
    }

    //  Polynomial terms.
    W = 1;
    for (I=0; I < NPOL; I++){
        X = X + XYPOL[0][I] * W;
        Y = Y + XYPOL[1][I] * W;
        W = W * T;
    }

    // X and Y (direction cosines).
    X = X * AS2R;
    Y = Y * AS2R;

    // Form the equator pole vector.
    VEQ[0] = X;
    VEQ[1] = Y;

    W = X * X + Y * Y;

    if (W < 1) {
        VEQ[2] = SQRT(1 - W);
    } else {
        VEQ[2] = 0;
    }

    return VEQ;
}


// Precession matrix, mean J2000.0
function ltp_PMAT ( EPJ ) {

    /* Long-term precession matrix.
     *
     * Given:
     *   EPJ d Julian epoch (TT)
     *
     * Returned:
     *   RP d precession matrix, J2000.0 to date
     *
     * The matrix is in the sense
     *
     *       P_date = RP x P_J2000,
     *
     * where P_J2000 is a vector with respect to the J2000.0 mean
     * equator and equinox and P_date is the same vector with respect to
     * the equator and equinox of epoch EPJ.
     *
     * Reference: Vondrak et al., A&A (2011), Eq.23
     *
     * Date: 2011 April 30
     *
     * Authors: J.Vondrak, N.Capitaine, P.Wallace
     */

    let PEQR = ltp_PEQU(EPJ);
    let PECL = ltp_PECL(EPJ);

    // Equinox (top row of matrix).

    // cross-product
    let V = [
        (PEQR[1] * PECL[2] - PECL[1] * PEQR[2]),
        (PEQR[2] * PECL[0] - PECL[2] * PEQR[0]),
        (PEQR[0] * PECL[1] - PECL[0] * PEQR[1])
    ];

    let W = SQRT(V[0] * V[0] + V[1] * V[1] + V[2] * V[2])
    // normalize
    let EQX = [V[0] / W, V[1] / W, V[2] / W];

    V = [
        (PEQR[1] * EQX[2] - EQX[1] * PEQR[2]),
        (PEQR[2] * EQX[0] - EQX[2] * PEQR[0]),
        (PEQR[0] * EQX[1] - EQX[0] * PEQR[1])
    ];

    return [EQX, V, PEQR]
}
