/*

This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org>

Explanation:

" Before 1988 in the US, works could be easily given into the public domain by
just releasing it without an explicit copyright notice. With the Berne
Convention Implementation Act of 1988 (and the earlier Copyright Act of 1976,
which went into effect in 1978), all works were by default copyright protected
and needed to be actively given into public domain by a waiver
statement/anti-copyright can call notice." -- Wikipedia (2022)

////////////////////////////////////////////////////////////////////////////////

Built with [Vanilla.js](http://vanilla-js.com/)

What happens here:

* Define a function akin to jQuery's `$(document).ready()`

* Unhide links for switching theme.

* mousing over references/footnotes raises content to overlay at
  bottom of screen

* Allow scrolling events to trigger functions when an element starts
  and stops being fully in view.

* Provide a way to have parallel animations running from a single
  `getAnimationFrame` loop.

*/

/*
    A fast and simple hash function with decent collision resistance.
    Largely inspired by MurmurHash2/3, but with a focus on speed/simplicity.
    Public domain. Unrequired Attribution: 2018 bryc (github.com/bryc)
    https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
    My own notes: Not for use with cryptographic purposes.
*/
const hash = function(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1>>>0);
};

// Allow interruption of onReady callbacks (for use with encrypted pages)
// During encryption, we inject a script element in the plaintext that
// calls onDecryption and set sourceDecrypted to false before decryption

var sourceDecrypted = true;
var executionQueue = [];

// wrapper for callbacks to respect state of safety
function safeCallback(callback) {
    return function() {
        executionQueue.push(callback);
        if (sourceDecrypted) {
            while (executionQueue.length > 0) {
                executionQueue.shift()();
            }
        }
    };
}

// all scripts may use onReady rather than window.onload
// to avoid conflict
function onReady(callback) {

    callback = safeCallback(callback);

    var registered = window.onload;
    if (document.readyState == 'complete') {
        callback();
    }
    else if (registered) {
        window.onload = function() {
            registered();
            callback();
        };
    } else {
        window.onload = function() {
            callback();
        };
    }
}

function onDecryption() {
    if (!sourceDecrypted) {
        sourceDecrypted = true;
        onReady(function() {;});
    }
}

/*
 *  ____       __
 * |  _ \ ___ / _| ___ _ __ ___ _ __   ___ ___  ___
 * | |_) / _ \ |_ / _ \ '__/ _ \ '_ \ / __/ _ \/ __|
 * |  _ <  __/  _|  __/ | |  __/ | | | (_|  __/\__ \
 * |_| \_\___|_|  \___|_|  \___|_| |_|\___\___||___/
 *
 */

onReady(function() {
    var refs = document.getElementsByClassName("footref");
    for (var i=0; i < refs.length; i++) {
        var r = refs[i];

        // ignore if reference is linked from another reference

        var doMouseover = function() {

            var target =  document.getElementById(
                this.getAttribute('href').replace('#', '')
            ).parentNode.parentNode;

            console.log(target);

            // only if reference not already in view
            var window_bottom = scrollY + window.innerHeight;
            if (target.offsetTop > window_bottom) {
                target.classList.add('active-ref');
                target.style.maxWidth = window.getComputedStyle(
                    document.getElementsByTagName('main')[0]
                ).maxWidth;
            }

        };
        var doMouseout = function() {
            document.getElementById(
                this.getAttribute('href').replace('#', '')
            ).parentNode.parentNode.classList.remove('active-ref');
        };
        var doClick = function() {
            document.getElementById(
                this.getAttribute('href').replace('#', '')
            ).parentNode.parentNode.classList.remove('active-ref');
            return true;
        };

        r.onmouseover = doMouseover;
        r.onmouseout = doMouseout;
        r.onclick = doClick;
    }
});

/*   ____                 _ _   _____     _
 *  / ___|  ___ _ __ ___ | | | |_   _| __(_) __ _  __ _  ___ _ __ ___
 *  \___ \ / __| '__/ _ \| | |   | || '__| |/ _` |/ _` |/ _ \ '__/ __|
 *   ___) | (__| | | (_) | | |   | || |  | | (_| | (_| |  __/ |  \__ \
 *  |____/ \___|_|  \___/|_|_|   |_||_|  |_|\__, |\__, |\___|_|  |___/
 *                                          |___/ |___/
 */

function bindScrollTriggers(element, over_cb, out_cb) {
    // register scroll listeners for element's bounding rectangle

    var scroll_listener = function listener() {
        // when element is completely in view, call call over_cb
        // when no longer completely in view, call out_cb

        var window_top = scrollY;
        var window_bottom = scrollY + window.innerHeight;

        if (window_bottom > listener.top &&
            window_top < listener.bottom) {
            if (!listener.active) {
                listener.active = true;
                over_cb();
            }
        } else if (listener.active) {
            listener.active = false;
            out_cb();
        }
    };
    scroll_listener.active = false;

    var resize_listener = function() {
        // update scroll_listener's coordinates

        var rect = element.getBoundingClientRect();

        // store coordinates relative to document
        scroll_listener.top = rect.top + scrollY;
        scroll_listener.bottom = rect.bottom + scrollY;

    };

    window.addEventListener('scroll', scroll_listener);
    window.addEventListener('resize', resize_listener);
    resize_listener();
    scroll_listener();
}

/*       _          _                 _   _
 *      / \   _ __ (_)_ __ ___   __ _| |_(_) ___  _ __  ___
 *     / _ \ | '_ \| | '_ ` _ \ / _` | __| |/ _ \| '_ \/ __|
 *    / ___ \| | | | | | | | | | (_| | |_| | (_) | | | \__ \
 *   /_/   \_\_| |_|_|_| |_| |_|\__,_|\__|_|\___/|_| |_|___/
 */

/*
 * Collect functions which update components when called.
 * These function will be called with (f, t) arguments,
 * where f is frame number since the function was registered.
 * and t is the unix time in milliseconds.
 *
 * Register such functions with `addAnimation(update_func)`
 *
 * Deregister them with `removeAnimation(update_func)`
 *
 * TODO reimplement `toggleAnimation(update_func)`
 */

var _animations = new Set();
var _animation_frame_counts = {};
var _animation_loop_running = false;

function addAnimation(update_func) {
    _animations.add(update_func);
    _animation_frame_counts[update_func] = 0;

    if (!_animation_loop_running) {
        // start animation
        window.requestAnimationFrame(_doAnimation);
    }
};

function removeAnimation(update_func) {
    _animations.delete(update_func);
    delete _animation_frame_counts[update_func]
}

function _doAnimation() {
    _animation_loop_running = true;

    var t = (new Date()).getTime();
    for (func of _animations) {
        var f = _animation_frame_counts[func];
        func(f, t);
        _animation_frame_counts[func] += 1;
    }

    if (_animations.size) {
        window.requestAnimationFrame(_doAnimation);
    } else {
        // no active animations. Wait for one to be added.
        _animation_loop_running = false;
    }
}

function animate_when_visible(element, animate_frame_callback) {

    bindScrollTriggers(
        element,
        // start animation when content in view
        function() {
            addAnimation(
                animate_frame_callback
            );
        },
        // stop animation when not in view
        function() {
            removeAnimation(
                animate_frame_callback
            );
        }
    );
};

/*  __  __
 * |  \/  | ___  _   _ ___  ___
 * | |\/| |/ _ \| | | / __|/ _ \
 * | |  | | (_) | |_| \__ \  __/
 * |_|  |_|\___/ \__,_|___/\___|
 */

// used by speck.js and minshader

var mouseDown = 0;
onReady(function(){
    document.body.addEventListener("mousedown", function() {
        mouseDown = 1;
    });
    document.body.addEventListener("mouseup", function() {
        mouseDown = 0;
    });
});

/*  ___
 * |_ _|_ __ ___   __ _  __ _  ___  ___
 *  | || '_ ` _ \ / _` |/ _` |/ _ \/ __|
 *  | || | | | | | (_| | (_| |  __/\__ \
 * |___|_| |_| |_|\__,_|\__, |\___||___/
 *                      |___/
 */

var global_disable_fullscreen_img_on_click = false;
onReady(function() {

    if (!global_disable_fullscreen_img_on_click) {

        var imgs = document.getElementsByTagName('img');

        for (var i=0; i < imgs.length; i++) {

            let img = imgs[i];

            img.onclick = function(){
                img.requestFullscreen();
            };
        }

        var svgs = document.getElementsByTagName('svg');

        for (var j=0; j < svgs.length; j++) {

            let svg = svgs[j];

            svg.onclick = function(){
                svg.requestFullscreen();
            };
        }
    }

});

/* __        ___ _    _                _ _
 * \ \      / (_) | _(_)_ __   ___  __| (_) __ _
 *  \ \ /\ / /| | |/ / | '_ \ / _ \/ _` | |/ _` |
 *   \ V  V / | |   <| | |_) |  __/ (_| | | (_| |
 *    \_/\_/  |_|_|\_\_| .__/ \___|\__,_|_|\__,_|
 *                     |_|
 */

onReady(function() {

    var links = document.getElementsByTagName('a');

    var active_ids = [];

    var base_url = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
    var pattern = /(?<=\/wiki\/).*/;

    for (var i=0; i < links.length; i++) {

        let x = links[i];
        let xhref = x.getAttribute('href');
        if (!xhref) {
            continue;
        }
        let xtarget = xhref.match(pattern);
        let endpoint = '';

        if (!xtarget) {
            continue;
        }

        let xid = 'a_' + hash(xhref).toString(36);
        x.setAttribute('id', xid);
        endpoint = base_url + xtarget[0];

        x.onmouseover = function() {

            active_ids.push(xid);

            var z = document.getElementById(xid + "-extract");

            if (z == null) {
                fetch(endpoint)
                    .then(function(response) {
                        return response.json();
                    })
                    .then(function(json_response) {

                        var y = document.createElement('div');
                        y.innerHTML = json_response.extract +
                            "<br><br><b>(Wikipedia Extract)</b>";
                        y.setAttribute("id", xid + "-extract");

                        document.getElementsByTagName('main')[0].appendChild(y);

                        if (active_ids.includes(xid)) { // mouse still over link
                            y.setAttribute("class", "active-ref wiki-extract");
                        } else { // network may be slow
                            y.setAttribute("class", "hidden wiki-extract");
                        }
                        y.style.width = window.getComputedStyle(
                            document.getElementsByTagName('main')[0]
                        ).maxWidth;
                    });

            } else {
                z.classList.remove('hidden');
                z.classList.add('active-ref');
                z.style.width = window.getComputedStyle(
                    document.getElementsByTagName('main')[0]
                ).maxWidth;
            }

        };

        x.onmouseout = function() {

            for (var j = 0; j < active_ids.length; j++) {

                var active_id = active_ids[j];

                var z = document.getElementById(active_id + "-extract");

                if (z != null) {
                    z.classList.remove('active-ref');
                    z.classList.add('hidden');
                }
            }
            active_ids = [];
        };

    }

});
