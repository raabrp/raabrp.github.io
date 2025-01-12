/** BSD 3-Clause License

Copyright 2025 Reilly Raab

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  1. Redistributions of source code must retain the above copyright notice, this
     list of conditions and the following disclaimer.
  2. Redistributions in binary form must reproduce the above copyright notice,
     this list of conditions and the following disclaimer in the documentation
     and/or other materials provided with the distribution.
  3. Neither the name of the copyright holder nor the names of its contributors
     may be used to endorse or promote products derived from this software without
     specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const EPS = 0.0001
const TEST_EPS = 0.01

let RADIUS = 7;
let ALLOWFREE = true;
let RENDER_EPHEMERAL = true;

// touch screen
if (navigator.maxTouchPoints || 'ontouchstart' in document.documentElement) {
    RADIUS = 12;
    RENDER_EPHEMERAL = false;
}

////////////////////////////////////////////////////////////////////////////////
// Geometry

// Interface Vec2 = {x: float, y: float}

// (Line, Line) -> [Vec2]
function get_intersections_ll(a, b) {

    const x1 = a.p.x;
    const y1 = a.p.y;
    const x2 = a.q.x;
    const y2 = a.q.y;
    const x3 = b.p.x;
    const y3 = b.p.y;
    const x4 = b.q.x;
    const y4 = b.q.y;

    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    // If the denominator is zero, the lines are parallel or coincident
    if (Math.abs(denominator) < EPS) {
        return [];  // Lines are parallel or coincident, no intersection
    }

    const x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator;
    const y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator;

    return [{ x, y }];
}

// (Line, Circle) -> [Vec2]
function get_intersections_lc(l, F) {

    const cx = F.c.x;
    const cy = F.c.y;

    // translate coordinates so circle is centered at origin
    const x1 = l.p.x - cx;
    const y1 = l.p.y - cy;
    const x2 = l.q.x - cx;
    const y2 = l.q.y - cy;

    // equation of translated line
    // ax + by + c = 0
    // distance -c/sqrt(aa+bb) from origin along vector (a, b)
    const a = y1 - y2;
    const b = x2 - x1;
    const c = x1 * y2 - x2 * y1;

    const m = a * a + b * b;

    const Fdx = F.p.x - F.c.x;
    const Fdy = F.p.y - F.c.y;
    const Fr2 = Fdx * Fdx + Fdy * Fdy;

    // distance between line and circle is Math.abs(c) / Math.sqrt(m) - B.r;
    // We care only about the sign of this distance, which is shared with
    const s = c * c - Fr2 * m;

    if (s > EPS) { // no intersections
        return [];
    } else if (s < -EPS) { // two intersections
        const v = Math.sqrt((Fr2 - c * c / m) / m);

        // translate coordinates back!
        return [
            {x: -a * c / m + b * v + cx, y: -b * c / m - a * v + cy},
            {x: -a * c / m - b * v + cx, y: -b * c / m + a * v + cy}
        ];
    } else { // tangent point
        let degenerate = {x: -a * c / m + cx, y: -b * c / m + cy};
        return [degenerate, degenerate];
    }
}

// (Circle, Circle) -> [Vec2]
function get_intersections_cc(F, G) {

    const x0 = F.c.x;
    const y0 = F.c.y;
    const dx = G.c.x - x0;
    const dy = G.c.y - y0;
    const d2 = dx * dx + dy * dy;
    if (d2 < EPS) {
        return [];
    }

    const Fdx = F.p.x - F.c.x;
    const Fdy = F.p.y - F.c.y;
    const Fr2 = Fdx * Fdx + Fdy * Fdy;

    const Gdx = G.p.x - G.c.x;
    const Gdy = G.p.y - G.c.y;
    const Gr2 = Gdx * Gdx + Gdy * Gdy;

    const f = (Fr2 - Gr2 + d2) / (2 * d2);
    const h2 = Fr2 / d2 - f * f;

    if (h2 < 0) {
        return [];
    } else if (h2 < EPS) {
        let degenerate = {x: x0 + f * dx, y: y0 + f * dy};
        return [degenerate, degenerate];
    } else {
        const h = Math.sqrt(h2);
        return [
            {x: x0 + f * dx + h * dy, y: y0 + f * dy - h * dx},
            {x: x0 + f * dx - h * dy, y: y0 + f * dy + h * dx}
        ];
    }

}

// obj1: Line | Circle (duck-typed by p,q | c,p)
// obj2: Line | Circle (duck-typed by p,q | c,p)
function get_intersections(obj1, obj2) {

    if (obj1.hasOwnProperty('q')) {
        if (obj2.hasOwnProperty('q')) {
            return get_intersections_ll(obj1, obj2);
        }
        return get_intersections_lc(obj1, obj2);
    }
    if (obj2.hasOwnProperty('q')) {
        return get_intersections_lc(obj2, obj1);
    }
    return get_intersections_cc(obj1, obj2);
}

////////////////////////////////////////////////////////////////////////////////

class Platonic {
    children = new Set(); // Platonic objects that depend on this one
    defined = true;
    removed = false;
    elem = null;
    degrees_of_freedom = new Set();

    update() {
        if (this.removed) {
            return;
        }
        for (let child of this.children) {
            child.update();
        }
        this.elem.update();
    }
    remove() {
        if (this.removed) {
            return;
        }
        for (let child of this.children) {
            child.remove();
        }
        this.elem.remove();
        this.removed = true;
    }

}

// implements Vec2
class Point extends Platonic {
    // p: Vec2
    // elem: DOM element
    constructor(p, elem) {
        super();
        this.x = p.x;
        this.y = p.y;
        this.elem = elem;
        this.degrees_of_freedom.add(this);
    }
    update({x, y}) {
        this.x = x;
        this.y = y;
        super.update();
    }
    as_function(scope) {
        return scope[this.elem.id]; // {x, y} | undefined
    }

}

// implements Point but does not inherit from it
class Intersection extends Platonic {
    reified = false;

    // obj1: Line | Circle
    // obj2: Line | Circle
    // k: int - index of intersection
    // p: vec
    // elem: DOM element
    constructor(obj1, obj2, k, p, elem) {
        super();
        this.obj1 = obj1;
        this.obj2 = obj2;
        obj1.children.add(this);
        obj2.children.add(this);

        this.k = k;
        this.dual = this.get_dual();

        this.x = p.x
        this.y = p.y

        this.elem = elem;
        obj1.degrees_of_freedom.forEach(this.degrees_of_freedom.add, this.degrees_of_freedom);
        obj2.degrees_of_freedom.forEach(this.degrees_of_freedom.add, this.degrees_of_freedom);
    }
    get_dual() {
        let p = new Set([this.obj1.p]);
        if (this.obj1.hasOwnProperty("q")) {
            p.add(this.obj1.q);
        }
        if (p.has(this.obj2.p))  {
            return this.obj2.p;
        }
        if (this.obj2.hasOwnProperty("q") && p.has(this.obj2.q)) {
            return this.obj2.q;
        }
    }
    choose(intersections, scope) {
        const nominal_intersection = intersections[this.k];

        if (this.dual !== undefined) {

            let _dual = this.dual;
            if (scope !== undefined) {
                _dual = _dual.as_function(scope);
            }

            if (Math.hypot(
                _dual.y - nominal_intersection.y,
                _dual.x - nominal_intersection.x
            ) <= EPS) {
                return intersections[1 - this.k];
            }
        }
        return nominal_intersection;
    }
    update() {
        if (!this.reified) {
            this.remove();
            return;
        }
        const intersections = get_intersections(this.obj1, this.obj2)
        const vec = this.choose(intersections);

        this.defined = (vec != undefined);

        if (this.defined) {
            this.x = vec.x;
            this.y = vec.y;
        }
        super.update();
    }
    remove() {
        this.obj1.children.delete(this);
        this.obj2.children.delete(this);
        super.remove();
    }
    as_function(scope) {
        const _obj1 = this.obj1.as_function(scope);
        const _obj2 = this.obj2.as_function(scope);
        if ((_obj1 === undefined) || (_obj2 === undefined)) {
            return undefined;
        }
        const intersections = get_intersections(_obj1, _obj2);
        return this.choose(intersections, scope); // {x, y} | undefined;
    }
}

let unchanged_euclidean = new Set();
let updated_euclidean = new Set();

// historically accurate!
class Euclidean extends Platonic {

    constructor() {
        super();
        updated_euclidean.add(this);
    }

    update() {
        unchanged_euclidean.delete(this);
        updated_euclidean.add(this);
        super.update();
    }
    remove () {
        unchanged_euclidean.delete(this);
        updated_euclidean.delete(this);
        super.remove();
    }
}
class Line extends Euclidean {
    // p: Point
    // q: Point
    // elem: DOM element
    constructor(p, q, elem) {
        super();
        this.p = p;
        this.q = q;
        this.elem = elem;
        p.children.add(this);
        q.children.add(this);

        p.degrees_of_freedom.forEach(this.degrees_of_freedom.add, this.degrees_of_freedom);
        q.degrees_of_freedom.forEach(this.degrees_of_freedom.add, this.degrees_of_freedom);
    }
    update() {
        this.defined = (this.p.defined && this.q.defined);
        super.update();
    }
    remove() {
        this.p.children.delete(this);
        this.q.children.delete(this);
        super.remove();
    }
    as_function(scope) {
        const _p = this.p.as_function(scope);
        const _q = this.q.as_function(scope);
        if ((_p === undefined) || (_q === undefined)) {
            return undefined;
        }
        return {p: _p, q: _q};
    }

}
class Circle extends Euclidean {
    // c: Point
    // p: Point
    // elem: DOM element
    constructor(c, p, elem) {
        super();
        this.c = c; // center
        this.p = p; // radial
        this.elem = elem;
        c.children.add(this);
        p.children.add(this);

        c.degrees_of_freedom.forEach(this.degrees_of_freedom.add, this.degrees_of_freedom);
        p.degrees_of_freedom.forEach(this.degrees_of_freedom.add, this.degrees_of_freedom);
    }
    update() {
        this.defined = (this.c.defined && this.p.defined);
        super.update();
    }
    remove() {
        this.c.children.delete(this);
        this.p.children.delete(this);
        super.remove();
    }
    as_function(scope) {
        const _c = this.c.as_function(scope);
        const _p = this.p.as_function(scope);
        if ((_c === undefined) || (_p === undefined)) {
            return undefined;
        }
        return {c: _c, p: _p};
    }
}


///////////////////////////////////////////////////////////////////////////////


const svg = document.getElementById("geometry-svg");
const plane = document.getElementById("plane");
const targetLayer = document.getElementById("target-layer");
const lineLayer = document.getElementById("line-layer");
const circleLayer = document.getElementById("circle-layer");
const intersectLayer = document.getElementById("intersect-layer");
const pointLayer = document.getElementById("point-layer");
let zoomLevel = 1.0;

d3svg = d3.select("#geometry-svg")
    .call(
        d3.zoom()
            .scaleExtent([0.1, 10])  // Set limits for zooming (min, max)
            .filter(function () {
                // disallow double click to zoom
                if (event.type === "dblclick") {
                    return false;
                }

                // Allow wheel and pinch gestures
                if (event.type === "wheel" || event.type === "touchmove") {
                    return true;
                }
                // Exclude click, mousedown, and touchstart events
                // unless pan tool is selected
                else {
                    return (currentTool === "pan");
                }
            })
            .on("zoom", zoomed)
    );

function zoomed(event) {
    d3svg.select("#plane").attr("transform", event.transform);
    zoomLevel = event.transform.k;
    d3svg.selectAll("circle.point")
        .attr("r", RADIUS / zoomLevel);
}


const toolbarButtons = document.querySelectorAll("button");

function buttonPress(id) {
    button = document.getElementById(id);
    toolbarButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    currentTool = button.id.replace("-tool", "");
    clearConstruction();
}

// Handle Tool Selection
toolbarButtons.forEach((button) => {
    if (button.id.endsWith("-tool")) {
        button.addEventListener("click", () => {
            buttonPress(button.id);
        });
    }
});

// Undo button for mobile
document.getElementById("undo-button").addEventListener("click", undo);
document.getElementById("redo-button").addEventListener("click", redo);
document.getElementById("share-button").addEventListener("click", share);

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
    switch(event.key) {
    case "Escape":
        clearConstruction();
        break;
    case "1":
        buttonPress('point-tool');
        break;
    case "2":
        buttonPress('line-tool');
        break;
    case "3":
        buttonPress('circle-tool');
        break;
    case "4":
        buttonPress('pan-tool');
        break;
    default:
            if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
            undo(); // Ctrl+Z
        } else if ((event.ctrlKey || event.metaKey) && event.key === "Z" && event.shiftKey) {
            redo(); // Ctrl+Shift+Z
        }
    }
});

let share_stack = [];
let action_stack = [];
let redo_stack = [];


function redo() {
  const action = redo_stack.pop();
  if (action) {
    action();
    action_stack.push(action);
  }
}

function undo() {

    if (temp_action_stack.length) {
        clearConstruction();
    } else {

        const action = action_stack.pop();

        if (action) {
            action.undo();
            redo_stack.push(action);
        }
    }
}

perform_action_callback = null;

function perform(action) {
    const output = action();
    action_stack.push(action);
    redo_stack = [];

    if (perform_action_callback) {
        perform_action_callback(output);
    }

    return output;
}

function perform_inject(action) {
    const output = action();
    let old_action = action_stack.pop();
    let replacement_action = () => {
        old_action();
        action();
    };
    replacement_action.undo = () => {
        action.undo();
        old_action.undo();
    };
    action_stack.push(replacement_action);
    redo_stack = [];

    if (perform_action_callback) {
        perform_action_callback(output);
    }

    return output;
}


// buffer shared by tools, cleared on changing tools
let vec_buffer = []; // Store temporary points during constructions
let tempElement = null; // Rendered but unplaced elements
let temp_action_stack = [];


function perform_temp(action) {
    const output = action();
    temp_action_stack.push(action);
    return output;
}

// combine temporary actions into single action sequence
function perform_composite(action) {

    output = perform_temp(action);
    const len = temp_action_stack.length;

    // make copy of temp action stack to be captured by closure.
    let composite_actions = [];
    for (let i=0; i<len; i++) {
        let a = temp_action_stack.pop(); // from right end
        composite_actions[len-i-1] = a; // same order as temp
    }

    let composite_action = () => {
        for (let i=0; i < len; i++) {
            composite_actions[i]();
        }
    }
    composite_action.undo = () => {
        for (let i=0; i < len; i++) {
            composite_actions[len-i-1].undo();
        }
    }
    action_stack.push(composite_action);
    redo_stack = [];

    if (perform_action_callback) {
        perform_action_callback(output);
    }

    clearConstruction();
    return output;
}

// Reset Temporary State
function clearConstruction() {
    for (let i=0; i < temp_action_stack.length; i++) {
        let action = temp_action_stack.pop();
        action.undo();
    }
    vec_buffer = [];
    if (tempElement) {
        tempElement.remove();
        tempElement = null;
    }
}

const num_colors = 48;

tools = {
    "pan": {
        mousedown: function(vec) { ; },
        mousemove: function(vec) { ; },
        mouseup: function(vec) { ; }
    },
    "point": {
        counter: 0, // unique point ids
        selected: null, // for dragging points
        act_create: function(vec) { // point

            let action = () => {
                const elem = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                elem.platonic = new Point(vec, elem);

                elem.setAttribute("id", `p${this.counter}`);
                elem.classList.add("point");
                elem.classList.add(`c${this.counter % num_colors}`);
                elem.update = handle_point_update(elem);
                elem.update();
                elem.setAttribute("r", RADIUS / zoomLevel);

                share_stack.push(`p${this.counter}`);
                this.counter++;
                pointLayer.appendChild(elem);

                return elem.platonic;
            };
            action.undo = () => {
                this.counter--;
                share_stack.pop();
                const elem = document.getElementById(`p${this.counter}`);
                elem.platonic.remove();
            };

            return action;
        },
        drag: function({ x, y }) {
            this.selected.setAttribute("cx", x);
            this.selected.setAttribute("cy", y);
            this.selected.platonic.update({ x, y });
        },
        act_move: function (elem, { x, y }) {
            this.selected = null;

            elem.classList.remove("dragging");
            const start_vec = vec_buffer.pop();

            // bind action to DOM id
            const elem_id = elem.id;

            let action = () => {
                // rebind elem using id of closure's capture
                const elem = document.getElementById(elem_id);
                elem.platonic.update({ x, y });

                placeIntersections();
            };
            action.undo = () => {
                // rebind elem using id of closure's capture
                const elem = document.getElementById(elem_id);
                elem.platonic.update({ x: start_vec.x, y: start_vec.y });

                placeIntersections();
            };

            return action;
        },
        act_intersect: function(obj1, obj2, k) {

            // bind to DOM ids of intersection's underlying objects
            const obj1_id = obj1.elem.id;
            const obj2_id = obj2.elem.id;

            let action = () => {

                // rebind using DOM ids
                const obj1 = document.getElementById(obj1_id).platonic;
                const obj2 = document.getElementById(obj2_id).platonic;
                const intersections = get_intersections(obj1, obj2);
                const p = intersections[k];

                const elem = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                elem.platonic = new Intersection(obj1, obj2, k, p, elem);
                elem.platonic.reified = true;

                elem.setAttribute("id", `p${this.counter}`);
                elem.classList.add("point");
                elem.classList.add("intersection");
                elem.classList.add("reified");
                elem.classList.add(`c${this.counter % num_colors}`);
                elem.update = handle_point_update(elem);
                elem.update();
                elem.setAttribute("r", RADIUS / zoomLevel);

                share_stack.push(`i${obj1_id}${obj2_id}k${k}`);
                this.counter++;
                pointLayer.appendChild(elem);

                return elem.platonic;
            };
            action.undo = () => {

                this.counter--;
                share_stack.pop();
                const elem = document.getElementById(`p${this.counter}`);
                elem.platonic.remove();
            };

            return action;
        },
        mousedown: function(vec) { // point

            // drag existing point
            if (vec instanceof Point) {
                this.selected = vec.elem;
                vec_buffer.push({ x: vec.x, y: vec.y }); // store original point, not one that moves with us!
                this.selected.classList.add("dragging");
            }
            // reify intersection
            else if (vec instanceof Intersection) {
                if (!(vec.reified)) {
                    let action = this.act_intersect(vec.obj1, vec.obj2, vec.k);
                    perform(action);
                }
            }
            // place new point
            else if (ALLOWFREE) {
                let action = this.act_create(vec);
                perform(action);
            }
        },
        mousemove: function(vec) {
            // drag point
            if (this.selected) {
                this.drag(vec);
            }
        },
        mouseup: function(vec) {
            // finish dragging point
            if (this.selected) {
                let action = this.act_move(this.selected, vec);
                perform(action);
            }
        },
    },
    "line": {
        counter: 0,
        act_create: function (p1, p2) { // line

            // bind action to DOM ids of p1 and p2
            const p1_id = p1.elem.id;
            const p2_id = p2.elem.id;

            action = () => {
                // rebind p1 and p2 using id of closure's capture
                const p1 = document.getElementById(p1_id).platonic;
                const p2 = document.getElementById(p2_id).platonic;

                const elem = document.createElementNS("http://www.w3.org/2000/svg", "line");
                elem.platonic = new Line(p1, p2, elem);

                elem.setAttribute("id", `l${this.counter}`);
                elem.update = () => {
                    if (elem.platonic.defined) {
                        elem.classList.remove("hidden");
                        let dx = elem.platonic.q.x - elem.platonic.p.x;
                        let dy = elem.platonic.q.y - elem.platonic.p.y;
                        let d = Math.hypot(dx, dy);
                        let xx = 10000 * dx / d;
                        let yy = 10000 * dy / d;
                        elem.setAttribute("x1", elem.platonic.p.x - xx);
                        elem.setAttribute("y1", elem.platonic.p.y - yy);
                        elem.setAttribute("x2", elem.platonic.q.x + xx);
                        elem.setAttribute("y2", elem.platonic.q.y + yy);
                    } else {
                        elem.classList.add("hidden");
                    }
                }
                elem.update();
                lineLayer.appendChild(elem);

                share_stack.push(`l${p1_id}${p2_id}`);
                this.counter++;
                placeIntersections();

                return elem.platonic;
            }
            action.undo = () => {
                this.counter--;
                share_stack.pop();
                const elem = document.getElementById(`l${this.counter}`);
                elem.platonic.remove();
            }

            return action;
        },
        render_ephemeral: function(p1, p2) { // line
            if (!RENDER_EPHEMERAL) {
                return;
            }
            if (!tempElement) {
                tempElement = document.createElementNS("http://www.w3.org/2000/svg", "line");
                tempElement.classList.add("temp")
                lineLayer.appendChild(tempElement);
            }
            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let d = Math.hypot(dx, dy);
            let xx = 10000 * dx / d;
            let yy = 10000 * dy / d;
            tempElement.setAttribute("x1", p1.x - xx);
            tempElement.setAttribute("y1", p1.y - yy);
            tempElement.setAttribute("x2", p2.x + xx);
            tempElement.setAttribute("y2", p2.y + yy);
        },
        mousedown: function(vec) { // line

            // reify intersection
            if (vec instanceof Intersection) {
                if (!(vec.reified)) {
                    vec = perform_temp(tools["point"].act_intersect(vec.obj1, vec.obj2, vec.k));
                }
            } else if (!(vec instanceof Point)) {
                // create new point
                if (ALLOWFREE) {
                    vec = perform_temp(tools["point"].act_create(vec));
                } else {
                    return;
                }
            }

            if (vec_buffer.length === 1) { // second point
                perform_composite(this.act_create(vec_buffer.pop(), vec));
            } else { // first point
                vec_buffer.push(vec);
            }
        },
        mousemove: function(vec) {
            if (vec_buffer.length === 1) {
                this.render_ephemeral(vec_buffer[0], vec);
            }
        },
        mouseup: function(vec) { ; }
    },
    "circle": {
        counter: 0,
        act_create: function(center, rad_point) { // circle

            // bind action to DOM ids of center and rad_point
            const center_id = center.elem.id;
            const rad_point_id = rad_point.elem.id;

            action = () => {
                // rebind center and rad_point using ids
                const center = document.getElementById(center_id).platonic;
                const rad_point = document.getElementById(rad_point_id).platonic;

                const elem = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                elem.platonic = new Circle(center, rad_point, elem);

                elem.setAttribute("id", `c${this.counter}`);

                const color_num = center_id.slice(1);
                elem.classList.add(`c${color_num}`);

                elem.update = () => {
                    if (elem.platonic.defined) {
                        elem.classList.remove("hidden");
                        elem.setAttribute("cx", elem.platonic.c.x);
                        elem.setAttribute("cy", elem.platonic.c.y);

                        const dx = elem.platonic.p.x - elem.platonic.c.x;
                        const dy = elem.platonic.p.y - elem.platonic.c.y;
                        const r2 = dx * dx + dy * dy;
                        const r = Math.sqrt(r2);

                        elem.setAttribute("r", r);
                    } else {
                        elem.classList.add("hidden");
                    }
                }
                elem.update();
                circleLayer.appendChild(elem);

                share_stack.push(`c${center_id}${rad_point_id}`);
                this.counter++;
                placeIntersections();

                return elem.platonic;
            }
            action.undo = () => {
                this.counter--;
                share_stack.pop();
                const elem = document.getElementById(`c${this.counter}`);
                elem.platonic.remove();
            }
            return action;
        },
        render_ephemeral: function(center, rad_point) { // circle
            if (!RENDER_EPHEMERAL) {
                return;
            }
            const radius = Math.hypot(center.x - rad_point.x, center.y - rad_point.y);

            if (!tempElement) {
                tempElement = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                tempElement.classList.add("temp")
                circleLayer.appendChild(tempElement);
            }
            tempElement.setAttribute("cx", center.x);
            tempElement.setAttribute("cy", center.y);
            tempElement.setAttribute("r", radius);
        },
        mousedown: function(vec) { // circle

            // reify intersection
            if (vec instanceof Intersection) {
                if (!(vec.reified)) {
                    vec = perform_temp(tools["point"].act_intersect(vec.obj1, vec.obj2, vec.k));
                }
            } else if (!(vec instanceof Point)) {
                // create new point
                if (ALLOWFREE) {
                    vec = perform_temp(tools["point"].act_create(vec));
                } else {
                    return;
                }
            }

            if (vec_buffer.length === 1) { // second point
                perform_composite(this.act_create(vec_buffer.pop(), vec));
            } else { // first point
                vec_buffer.push(vec);
            }
        },
        mousemove: function(vec) {
            if (vec_buffer.length === 1) {
                this.render_ephemeral(vec_buffer[0], vec);
            }
        },
        mouseup: function(vec) { ; }
    }
};

function handle_point_update(elem) {
    return () => {
        if (elem.platonic.defined) {
            elem.classList.remove("hidden");
            elem.setAttribute("cx", elem.platonic.x);
            elem.setAttribute("cy", elem.platonic.y);
        } else {
            elem.classList.add("hidden");
        }
    }
}


function placeIntersections() {
    for (let obj1 of updated_euclidean) {
        if (obj1.defined) {
            for (let obj2 of unchanged_euclidean) {
                if (obj2.defined) {
                    let intersections = get_intersections(obj1, obj2);
                    for (k=0; k < intersections.length; k++) {

                        let p = intersections[k];
                        let elem = document.createElementNS("http://www.w3.org/2000/svg", "circle");

                        elem.platonic = new Intersection(obj1, obj2, k, p, elem);
                        elem.classList.add("point");
                        elem.classList.add("intersection");
                        elem.update = handle_point_update(elem);
                        elem.update();

                        elem.setAttribute("r", RADIUS / zoomLevel);
                        intersectLayer.appendChild(elem);
                    }
                }
            }
        }
        updated_euclidean.delete(obj1);
        unchanged_euclidean.add(obj1);
    }
}

let currentTool = "point";
document.getElementById(`${currentTool}-tool`).classList.add("active");

function get_vec(event) {
    const transform = d3.zoomTransform(svg); // Get the current transform
    const vecs = d3.pointer(event, svg); // Get mouse position in SVG
    const inverted = transform.invert(vecs); // Invert to original space
    return { x: inverted[0], y: inverted[1] };
}

svg.addEventListener("pointerdown", (event) => {
    let vec;
    if (event.target.classList.contains("point")) {
        vec = event.target.platonic;
    } else {
        vec = get_vec(event);
    }
    tools[currentTool].mousedown(vec);
});

svg.addEventListener("pointermove", (event) => {
    const vec = get_vec(event);
    tools[currentTool].mousemove(vec);
});

svg.addEventListener("pointerup", (event) => {
    const vec = get_vec(event);
    tools[currentTool].mouseup(vec);
});

////////////////////////////////////////////////////////////////////////////////
// Manual state initialization
////////////////////////////////////////////////////////////////////////////////

let origin = {x: svg.width.baseVal.value / 2, y: svg.height.baseVal.value / 2}
let unit = 100;
let init_stack = [];

function reset_all() {
    share_stack = [];
    action_stack = [];
    redo_stack = [];
    temp_action_stack = [];
    tools['point'].counter = 0;
    tools['point'].selected = null;
    tools['line'].counter = 0;
    tools['circle'].counter = 0;
    document.querySelectorAll("circle.point").forEach((elem) => { elem.platonic.remove(); });
    clearConstruction();
}

function init_point(x, y) {
    return tools["point"].act_create(
        {x: origin.x + unit * x, y: origin.y + unit * y}
    )(); // no undo
}
function init_line(p1, p2) {
    return tools["line"].act_create(p1, p2)();
}
function init_circle(c, r) {
    return tools["circle"].act_create(c, r)();
}
function init_intersect(obj1, obj2, k) {
    return tools["point"].act_intersect(obj1, obj2, k)();
}

class Target extends Platonic {
    constructor(parents, elem) {
        super();
        for (let parent of parents) {
            parent.children.add(this);
        }
        this.elem = elem;
    }
    update() {
        super.update();
    }
}

function init_target_point(parents, solution) {
    const elem = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    elem.platonic = new Target(parents, elem);

    elem.setAttribute("id", `target-point`);
    elem.classList.add("point", "target");
    elem.setAttribute("r", RADIUS / zoomLevel);
    elem.update = () => {
        let {x, y} = solution(parents);
        elem.setAttribute("cx", x);
        elem.setAttribute("cy", y);
    }
    elem.update();
    targetLayer.appendChild(elem);
}

function init_target_line(parents, solution) {
    const elem = document.createElementNS("http://www.w3.org/2000/svg", "line");
    elem.platonic = new Target(parents, elem);

    elem.setAttribute("id", `target-line`);
    elem.classList.add("target");
    elem.update = () => {
        let sol = solution(parents);
        if (sol === undefined) {
            elem.classList.add("hidden");
        } else {
            elem.classList.remove("hidden");
            let {p, q} = sol;

            let dx = q.x - p.x;
            let dy = q.y - p.y;
            let d = Math.hypot(dx, dy);
            let xx = 10000 * dx / d;
            let yy = 10000 * dy / d;

            elem.setAttribute("x1", p.x - xx);
            elem.setAttribute("y1", p.y - yy);
            elem.setAttribute("x2", q.x + xx);
            elem.setAttribute("y2", q.y + yy);
        }
    }
    elem.update();
    targetLayer.appendChild(elem);
}

function init_target_circle(parents, solution) {
    const elem = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    elem.platonic = new Target(parents, elem);

    elem.setAttribute("id", `target-circle`);
    elem.classList.add("target");
    elem.update = () => {
        let {c, p} = solution(parents);
        elem.setAttribute("cx", c.x);
        elem.setAttribute("cy", c.y);
        elem.setAttribute("r", Math.hypot(p.y - c.y, p.x - c.x));
    }
    elem.update();
    targetLayer.appendChild(elem);
}

function init_target_circle_cr(parents, solution) {
    const elem = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    elem.platonic = new Target(parents, elem);

    elem.setAttribute("id", `target-circle`);
    elem.classList.add("target");
    elem.update = () => {
        let {c, r} = solution(parents);
        elem.setAttribute("cx", c.x);
        elem.setAttribute("cy", c.y);
        elem.setAttribute("r", r);
    }
    elem.update();
    targetLayer.appendChild(elem);
}

// -----------------------------------------------------------------------------
// URL sharing and parsing

const regex = /^((p(-?\d*),(-?\d*))|(c(p\d*)(p\d*))|(l(p\d*)(p\d*))|(i([lc]\d*)([lc]\d*)k(\d*))|(m(\d*),(\d*)(p\d*)))/;
function parse(substr) {
    if (substr === null) {
        return;
    }
    const m = substr.match(regex);
    if (m === null) {
        return;
    }
    else if (m[2]) {
        perform(tools["point"].act_create(
            {x: Number(m[3]), y: Number(m[4])}
        ));
    }
    else if (m[5]) {
        perform(tools["circle"].act_create(
            document.getElementById(m[6]).platonic,
            document.getElementById(m[7]).platonic
        ));
    }
    else if (m[8]) {
        perform(tools["line"].act_create(
            document.getElementById(m[9]).platonic,
            document.getElementById(m[10]).platonic
        ));
    }
    else if (m[11]) {
        perform(tools["point"].act_intersect(
            document.getElementById(m[12]).platonic,
            document.getElementById(m[13]).platonic,
            Number(m[14])
        ));
    }
    else if (m[15]) {
        const elem = document.getElementById(m[18]);
        vec_buffer.push({ x: elem.platonic.x, y: elem.platonic.y });
        perform(tools["point"].act_move(
            elem,
            {x: Number(m[16]), y: Number(m[17])}
        ));
    }
    else {
        console.log(substr);
        throw "Parse Error";
    }
    return parse(substr.slice(m[0].length))
}

function load_url() {
    const url_params = new URLSearchParams(window.location.search);
    const init = url_params.get('init');
    const state = url_params.get('state');

    load_challenge(problems[init]);
    parse(state);
}

const notification = document.getElementById("notification");
function notify(value) {
    notification.innerHTML = value;
    setTimeout(function() {
        notification.innerHTML = "";
    }, 2000);
}

function share() {

    const url_params = new URLSearchParams(window.location.search);
    const init = url_params.get('init');
    let state = '';

    document.querySelectorAll("#point-layer > circle.point").forEach((elem) => {
    });

    for (let line of init_stack) {
        if (line[0] === "p") {
            let elem = document.getElementById(line);
            state += `m${Math.round(elem.platonic.x)},${Math.round(elem.platonic.y)}${elem.id}`;
        }
    }

    for (let line of share_stack) {
        if (line[0] === "p") {
            let elem = document.getElementById(line);
            state += `p${Math.round(elem.platonic.x)},${Math.round(elem.platonic.y)}`;
        } else {
            state += line;
        }
    }

    let url = location.protocol + "//" + window.location.host + window.location.pathname + "?init=" + init + "&state=" + state;
    let ret = navigator.clipboard.writeText(url)
        .then(() => {
            notify("Link copied");
        })
        .catch(() => {
            window.location.href = url;
        });
}

let completed = false;
function complete(msg) {
    if (msg === undefined) {
        msg = "SUCCESS!";
    }
    let success = () => {
        document.getElementById("done").innerHTML=msg;
        completed = true;
    };
    success.undo = () => {
        document.getElementById("done").innerHTML="";
        completed = false;
    };

    perform_inject(success);
}


////////////////////////////////////////////////////////////////////////////////

function load_challenge(init_challenge) {
    reset_all();
    init_challenge();
    init_stack = share_stack;
    share_stack=[];
}


let rnd = new Srand(0);

function poisson_disc_sample(n, k, radius, width, height) {
    // Poisson Disc Sampling in 2 dimensions
    // n points
    // k candidate per sample
    // samples in box of size (width x height)
    // with minimum radius between them
    // https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf

    // Initialize the points array and the active list
    let points = [];
    let active_points = [];

    const inv_cell_size = Math.sqrt(2) / radius
    // stores indices in points array
    let grid = new Array(Math.ceil(width * inv_cell_size)).fill(undefined).map(
        () => new Array(Math.ceil(height * inv_cell_size)).fill(undefined)
    );

    function get_grid_indices(point) {
        return [
            Math.floor(point.x * inv_cell_size),
            Math.floor(point.y * inv_cell_size)
        ];
    }
    function add_point(point) {
        let [idx, idy] = get_grid_indices(point);
        grid[idx][idy] = points.length;
        points.push(point);
        active_points.push(point);
    }

    add_point({x: width / 2, y: height / 2});

    function get_grid_neighbors([idx, idy]) {
        let neighbors = [];
        const mdx = 2;
        for (let dx = -mdx; dx <= mdx; dx++) {
            let mdy;
            if ((dx == -mdx) || (dx == mdx)) {
                mdy = 1;
            } else { mdy = 2; }
            for (let dy = -mdy; dy <= mdy; dy++) {
                let point;
                let g = grid[idx + dx];
                if (!(g === undefined)) {
                    g = g[idy + dy];
                    if (!(g === undefined)) {
                        point = points[g];
                        if (!(point === undefined)) {
                            neighbors.push(point);
                        }
                    }
                }
            }
        }
        return neighbors;
    }


    function is_valid(point) {
        const neighbors = get_grid_neighbors(get_grid_indices(point));

        for (const neighbor of neighbors) {
            const dist = Math.hypot(neighbor.x - point.x, neighbor.y - point.y);
            if (dist < radius) {
                return false;
            }
        }
        return true;
    }

    // Function to generate random candidate points
    function generateCandidates(point) {
        const candidates = [];
        for (let i = 0; i < k; i++) {
            const angle = rnd.random() * 2 * Math.PI;
            const dist = rnd.random() * radius + radius;
            const newPoint = {
                x: point.x + dist * Math.cos(angle),
                y: point.y + dist * Math.sin(angle),
            };
            // check bounds
            if (newPoint.x >= 0 && newPoint.x <= width && newPoint.y >= 0 && newPoint.y <= height) {
                candidates.push(newPoint);
            }
        }
        return candidates;
    }


    // main loop
    while (active_points.length > 0 && points.length < n) {
        // sample random active point
        const idx = Math.floor(rnd.random() * active_points.length);
        const currentPoint = active_points[idx];

        let found = false;
        const candidates = generateCandidates(currentPoint);
        for (const candidate of candidates) {
            if (is_valid(candidate)) {
                add_point(candidate);
                found = true;
                break;
            }
        }
        if (!found) {
            active_points.splice(idx, 1); // remove from active_points
        }
    }

    return points;
}

function get_random_points(n) {
    return poisson_disc_sample(
        n, k=5, radius=100,
        width = svg.width.baseVal.value,
        height = svg.height.baseVal.value
    );
}

function trilinear_to_cartesian(x, y, z, A, B, C) {
    // side lengths
    let a = Math.hypot(C.y - B.y, C.x - B.x);
    let b = Math.hypot(A.y - C.y, A.x - C.x);
    let c = Math.hypot(B.y - A.y, B.x - A.x);

    // coefficients
    let d = a * x + b * y + c * z;
    let alpha = a * x;
    let beta = b * y;
    let gamma = c * z;

    return {
        x: (alpha * A.x + beta * B.x + gamma * C.x) / d,
        y: (alpha * A.y + beta * B.y + gamma * C.y) / d
    };
}

function run_battery(fails_test, max_iter, success_threshold) {

    // reset random number generator
    rnd = new Srand(0);
    let successes = 0;
    let fails = 0;
    if (success_threshold === undefined) {
        success_threshold = max_iter;
    }
    const fail_threshold = max_iter - success_threshold;
    while (true) {
        failed = fails_test();
        if (failed === null) {
            continue; // sample reject
        }
        else if (failed) {
            fails += 1;
        } else {
            successes += 1;
        }
        if (successes >= success_threshold) {
            return complete();
        }
        if (fails > fail_threshold) {
            return;
        }
    }
}

let problems = {
    null: () => {
        ALLOWFREE = true;
    },
    "perpendicular-bisector": () => {
        // http://localhost:8000/geometry.html?init=perpendicular-bisector&state=cp0p1cp1p0ic1c0k1ic1c0k0lp2p3
        ALLOWFREE = false;

        let a = init_point(-1, 0);
        let b = init_point(1, 0);

        function solution([a, b]) {
            let p = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
            let perp = {x: b.y - a.y, y: a.x - b.x};
            let q = {x: p.x + perp.x, y: p.y + perp.y};

            return {p, q};
        }

        init_target_line([a, b], solution);

        perform_action_callback = function(obj) {
            if (completed) { return; }
            if (!(obj instanceof Line)) { return; }

            let scope = {};

            function fails_random_test() {

                rand_points = get_random_points(2);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const v1 = [_b.x - _a.x, _b.y - _a.y];
                const v2 = [_obj.q.x - _obj.p.x, _obj.q.y - _obj.p.y];
                const dot_product = v1[0] * v2[0] + v1[1] * v2[1];

                return Math.abs(dot_product) > TEST_EPS;
            }

            run_battery(fails_random_test, 100);
        }
    },
    "angle-bisector": () => {
        // http://localhost:8000/geometry.html?init=angle-bisector&state=lp0p1cp0p2ic0l0k0cp2p3cp3p2ic2c1k0ic2c1k1lp4p5
        ALLOWFREE = false;

        let a = init_point(-1, 0);
        let b = init_point(1, 0);
        let c = init_point(0, -1);

        function solution([a, b, c]) {
            let t1 = Math.atan2(b.y - a.y, b.x - a.x);
            let t2 = Math.atan2(c.y - a.y, c.x - a.x);

            let ang = (t1 + t2) / 2;

            return {p: a, q: {x: a.x + Math.cos(ang), y: a.y + Math.sin(ang)}};
        }

        init_target_line([a, b, c], solution);

        perform_action_callback = function(obj) {
            if (completed) { return; }
            if (!(obj instanceof Line)) { return; }

            let scope = {};

            function fails_random_test() {

                rand_points = get_random_points(3);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const t1 = Math.atan2(_b.y - _a.y, _b.x - _a.x);
                const t2 = Math.atan2(_c.y - _a.y, _c.x - _a.x);

                const ang_target = (t1 + t2) / 2;
                const ang = Math.atan2(_obj.q.y - _obj.p.y, _obj.q.x - _obj.p.x);

                if (Math.abs(ang_target - ang) < TEST_EPS) {
                    return false;
                } else if (Math.abs(ang_target - ang + Math.PI) < TEST_EPS) {
                    return false;
                } else if (Math.abs(ang_target - ang - Math.PI) < TEST_EPS) {
                    return false;
                } else {
                    return true;
                }
            }

            run_battery(fails_random_test, 100);

        }
    },
    "projection": () => {
        // http://localhost:8000/geometry.html?init=projection&state=cp2p0cp1p0ic1c0k1lp0p3il1l0k0
        ALLOWFREE = false;

        let a = init_point(0, -1);
        let b = init_point(-1, 0.5);
        let c = init_point(1.5, 0.5);

        let bc = init_line(b, c);

        function solution([a, b, c]) {

            let dx = c.x - b.x;
            let dy = c.y - b.y;
            let bc = dy * dy + dx * dx;
            let dot = (c.y - b.y) * (a.y - b.y) + (c.x - b.x) * (a.x - b.x);
            let s = dot / bc;

            return {x: b.x + dx * s, y: b.y + dy * s};
        }

        init_target_point([a, b, c], solution);

        perform_action_callback = function(obj) {
            if (completed) { return; }
            if (!(obj instanceof Intersection)) { return; }

            let scope = {};

            function fails_random_test() {

                rand_points = get_random_points(3);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _b, _c]);

                if (Math.abs(_obj.x - _sol.x) > TEST_EPS) {
                    return true;
                }
                if (Math.abs(_obj.y - _sol.y) > TEST_EPS) {
                    return true;
                }
                return false;

            }

            run_battery(fails_random_test, 100);
        }
    },
    "parallel": () => {
        // http://localhost:8000/geometry.html?init=parallel&state=cp1p2cp2p1ic1c0k0ic1c0k1lp3p4cp4p0cp3p0ic3c2k1lp0p5
        ALLOWFREE = false;

        let a = init_point(0, -1);
        let b = init_point(-1, 0.5);
        let c = init_point(1.5, 0.5);

        let bc = init_line(b, c);

        function solution([a, b, c]) {

            let dx = c.x - b.x;
            let dy = c.y - b.y;

            return {p: {x: a.x, y: a.y}, q: {x: a.x + dx, y: a.y + dy}};
        }

        init_target_line([a, b, c], solution);

        perform_action_callback = function(obj) {
            if (completed) { return; }
            if (!(obj instanceof Line)) { return; }

            let scope = {};

            function fails_random_test() {

                rand_points = get_random_points(3);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const dist_target = _a.x * (_c.y - _b.y) - _a.y * (_c.x - _b.x);
                const dist_p = _obj.p.x * (_c.y - _b.y) - _obj.p.y * (_c.x - _b.x);
                const dist_q = _obj.q.x * (_c.y - _b.y) - _obj.q.y * (_c.x - _b.x);

                if (Math.abs(dist_target - dist_p) > TEST_EPS) {
                    return true;
                }
                if (Math.abs(dist_target - dist_q) > TEST_EPS) {
                    return true;
                }
                if (Math.hypot(_obj.q.y - _obj.p.y, _obj.q.x - _obj.p.x) < EPS) { // degeneracy
                    return true;
                }
                return false;
            }

            run_battery(fails_random_test, 100);
        }
    },
    "dist-transfer": () => {
        // http://localhost:8000/geometry.html?init=dist-transfer&state=cp2p0cp0p2ic1c0k1lp4p0cp0p1ic2l2k0cp4p5lp4p2il3c3k0cp2p6ic4l1k0
        ALLOWFREE = false;

        let a = init_point(-0.5, -1);
        let b = init_point(-1, -3);
        let c = init_point(1, 1);
        let d = init_point(4, 1);

        let ab = init_line(a, b);
        let cd = init_line(c, d);

        function solution([a, b, c, d]) {

            let s = Math.hypot(b.y - a.y, b.x - a.x) / Math.hypot(d.y - c.y, d.x - c.x)

            return {
                x: c.x + (d.x - c.x) * s,
                y: c.y + (d.y - c.y) * s
            };
        }

        init_target_point([a, b, c, d], solution);

        perform_action_callback = function(obj) {
            if (completed) { return; }
            if (!(obj instanceof Intersection)) { return; }

            let scope = {};

            function fails_random_test() {

                rand_points = get_random_points(4);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];
                scope[d.elem.id] = _d = rand_points[3];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _b, _c, _d]);

                if (Math.abs(_obj.x - _sol.x) > TEST_EPS) {
                    return true;
                }
                if (Math.abs(_obj.y - _sol.y) > TEST_EPS) {
                    return true;
                }
                return false;

            }

            run_battery(fails_random_test, 100, 100);
        }
    },
    "tangent": () => {
        // http://localhost:8000/geometry.html?init=tangent&state=cp0p2cp2p2cp2p0ic3c1k1ic3c1k0lp3p4lp0p2il1l0k0cp5p0ic4c0k1lp6p2
        ALLOWFREE = false;

        let a = init_point(-1, 0);
        let b = init_point(-2, 0);
        let c = init_circle(a, b);
        let d = init_point(2, 0);

        function solution([a, b, c, d]) {

            let midpoint = {x: (a.x + d.x) / 2, y: (a.y + d.y) / 2};

            let q = get_intersections_cc({c: midpoint, p: a}, {c: a, p: b})[1];
            if (q === undefined) {
                return undefined;
            }

            return {p: d, q: q};
        }

        init_target_line([a, b, c, d], solution);

        perform_action_callback = function(obj) {
            if (completed) { return; }
            if (!(obj instanceof Line)) { return; }

            let scope = {};

            function fails_random_test() {

                rand_points = get_random_points(4);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];
                scope[d.elem.id] = _d = rand_points[3];

                const _sol = solution([_a, _b, _c, _d]);
                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return (_sol !== undefined); }
                if (_sol === undefined) { return (_obj !== undefined); }

                const perp = [_sol.q.y - _sol.p.y, _sol.p.x - _sol.q.x];
                const vec = [_obj.q.x - _obj.p.x, _obj.q.y - _obj.p.y];
                const dot_product = perp[0] * vec[0] + perp[1] * vec[1];

                return Math.abs(dot_product) > TEST_EPS;
            }

            run_battery(fails_random_test, 100);
        }
    },
    "circumscribe": () => {
        // http://localhost:8000/geometry.html?init=circumscribe&state=cp1p2cp2p1ic1c0k0ic1c0k1lp3p4cp0p2cp2p0ic3c2k1ic3c2k0lp5p6il4l3k0cp7p2
        ALLOWFREE = false;

        let a = init_point(-1, 1);
        let b = init_point(2, 0);
        let c = init_point(0, -2);

        function solution([a, b, c]) {

            // ba, ca
            let dotA = (b.y - a.y) * (c.y - a.y) + (b.x - a.x) * (c.x - a.x);
            // cb, ab
            let dotB = (c.y - b.y) * (a.y - b.y) + (c.x - b.x) * (a.x - b.x);
            // ac, bc
            let dotC = (a.y - c.y) * (b.y - c.y) + (a.x - c.x) * (b.x - c.x);

            let ab = Math.hypot(b.y - a.y, b.x - a.x);
            let bc = Math.hypot(c.y - b.y, c.x - b.x);
            let ca = Math.hypot(a.y - c.y, a.x - c.x);

            let cosA = dotA / (ab * ca);
            let cosB = dotB / (bc * ab);
            let cosC = dotC / (ca * bc);

            let center = trilinear_to_cartesian(cosA, cosB, cosC, a, b, c);

            // Rsin
            let radius = Math.hypot(center.y - a.y, center.x - a.x);

            return {c: center, r: radius};
        }

        init_target_circle_cr([a, b, c], solution);

        perform_action_callback = function(obj) {

            if (completed) { return; }
            if (!(obj instanceof Circle)) { return; }

            let scope = {};
            function fails_random_test() {

                rand_points = get_random_points(3);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _b, _c]);

                const _dc = Math.hypot(_obj.c.y - _sol.c.y, _obj.c.x - _sol.c.x);
                if (_dc > TEST_EPS) {
                    return true;
                }
                const _obj_r = Math.hypot(_obj.p.y - _obj.c.y, _obj.p.x - _obj.c.x);
                if (Math.abs(_obj_r - _sol.r) > TEST_EPS) {
                    return true;
                }

                return false;

            }

            run_battery(fails_random_test, 100);
        }
    },
    "inscribe": () => {
        // http://localhost:8000/geometry.html?init=inscribe&state=cp2p1ic0l2k0cp1p3cp3p1ic2c1k0ic2c1k1lp4p5cp1p2ic3l0k1cp6p2cp2p6ic5c4k1ic5c4k0lp7p8il4l3k0cp1p9cp2p9ic7c6k0lp9p10il5l1k0cp9p11
        ALLOWFREE = false;

        let a = init_point(-1, 1);
        let b = init_point(2, 0);
        let c = init_point(0, -2);
        let ab = init_line(a, b);
        let bc = init_line(b, c);
        let ca = init_line(c, a);

        function solution([a, b, c]) {
            let center = trilinear_to_cartesian(1, 1, 1, a, b, c);
            let Ldx = a.x - c.x;
            let Ldy = a.y - c.y;
            let L2 = Ldx * Ldx + Ldy * Ldy;
            let Rdx = center.x - c.x;
            let Rdy = center.y - c.y;
            let R2 =  Rdx * Rdx + Rdy * Rdy;
            let LRcos = Ldx * Rdx + Ldy * Rdy;
            // Rsin
            let radius = Math.sqrt(R2 - LRcos * LRcos / L2);

            return {c: center, r: radius};
        }

        init_target_circle_cr([a, b, c], solution);

        perform_action_callback = function(obj) {

            if (completed) { return; }
            if (!(obj instanceof Circle)) { return; }

            let scope = {};
            function fails_random_test() {

                rand_points = get_random_points(3);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _b, _c]);

                const _dc = Math.hypot(_obj.c.y - _sol.c.y, _obj.c.x - _sol.c.x);
                if (_dc > TEST_EPS) {
                    return true;
                }
                const _obj_r = Math.hypot(_obj.p.y - _obj.c.y, _obj.p.x - _obj.c.x);
                if (Math.abs(_obj_r - _sol.r) > TEST_EPS) {
                    return true;
                }

                return false;

            }

            run_battery(fails_random_test, 100);
        }
    },
    "escribe": () => {
        // http://localhost:8000/geometry.html?init=escribe&state=cp0p2ic0l0k1cp2p3cp3p2ic2c1k0ic2c1k1lp4p5cp2p0ic3l1k0cp6p0cp0p6ic5c4k1ic5c4k0lp7p8il4l3k0cp0p9cp2p9ic7c6k0lp9p10il5l2k0cp9p11
        ALLOWFREE = false;

        let a = init_point(-1, 1);
        let b = init_point(2, 0);
        let c = init_point(0, -2);
        let ab = init_line(a, b);
        let bc = init_line(b, c);
        let ca = init_line(c, a);

        function solution([a, b, c]) {
            let center = trilinear_to_cartesian(1, -1, 1, a, b, c);
            let Ldx = a.x - c.x;
            let Ldy = a.y - c.y;
            let L2 = Ldx * Ldx + Ldy * Ldy;
            let Rdx = center.x - c.x;
            let Rdy = center.y - c.y;
            let R2 =  Rdx * Rdx + Rdy * Rdy;
            let LRcos = Ldx * Rdx + Ldy * Rdy;
            // Rsin
            let radius = Math.sqrt(R2 - LRcos * LRcos / L2);

            return {c: center, r: radius};
        }

        init_target_circle_cr([a, b, c], solution);

        perform_action_callback = function(obj) {

            if (completed) { return; }
            if (!(obj instanceof Circle)) { return; }

            let scope = {};
            function fails_random_test() {

                rand_points = get_random_points(3);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _b, _c]);

                const _dc = Math.hypot(_obj.c.y - _sol.c.y, _obj.c.x - _sol.c.x);
                if (_dc > TEST_EPS) {
                    return true;
                }
                const _obj_r = Math.hypot(_obj.p.y - _obj.c.y, _obj.p.x - _obj.c.x);
                if (Math.abs(_obj_r - _sol.r) > TEST_EPS) {
                    return true;
                }

                return false;

            }

            run_battery(fails_random_test, 100);
        }
    },
    "vector-add": () => {
        // http://localhost:8000/geometry.html?init=vector-add&state=cp1p2cp2p1ic1c0k0ic1c0k1lp3p4lp1p2il1l0k0lp0p5cp5p0ic2l2k0
        ALLOWFREE = false;

        let a = init_point(-1, 1);
        let b = init_point(-1, -1.5);
        let c = init_point(0.5, 0.5);

        function solution([a, b, c]) {

            return {x: b.x + c.x - a.x, y: b.y + c.y - a.y};
        }

        init_target_point([a, b, c], solution);

        perform_action_callback = function(obj) {
            if (completed) { return; }
            if (!(obj instanceof Intersection)) { return; }

            let scope = {};

            function fails_random_test() {

                rand_points = get_random_points(3);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _b, _c]);

                if (Math.abs(_obj.x - _sol.x) > TEST_EPS) {
                    return true;
                }
                if (Math.abs(_obj.y - _sol.y) > TEST_EPS) {
                    return true;
                }
                return false;

            }

            run_battery(fails_random_test, 100);
        }
    },
    "angle-add": () => {
        // http://localhost:8000/geometry.html?init=angle-add&state=cp0p2ic0l0k0cp2p4ic1l1k0cp0p5ic0l2k0ic2l2k0cp6p7ic0c3k0lp0p8

        ALLOWFREE = false;

        let a = init_point(-1, 1);
        let b = init_point(Math.sqrt(2) * Math.cos(0) - 1, -Math.sqrt(2) * Math.sin(0) + 1);
        let c = init_point(Math.sqrt(3) * Math.cos(1) - 1, -Math.sqrt(3) * Math.sin(1) + 1);
        let d = init_point(Math.sqrt(4) * Math.cos(1.5) - 1, -Math.sqrt(4) * Math.sin(1.5) + 1);

        let ab = init_line(a, b);
        let ac = init_line(a, c);
        let ad = init_line(a, d);

        function summation([a, b, c, d]) {

            let theta = (
                Math.atan2(c.y - a.y, c.x - a.x)
                + Math.atan2(d.y - a.y, d.x - a.x)
                - Math.atan2(b.y - a.y, b.x - a.x)
            );

            return {p: a, q: {x: a.x + Math.cos(theta), y: a.y + Math.sin(theta)}};
        }

        init_target_line([a, b, c, d], summation);

        function diff1([a, b, c, d]) {
            const theta = (
                Math.atan2(c.y - a.y, c.x - a.x)
                - Math.atan2(d.y - a.y, d.x - a.x)
                + Math.atan2(b.y - a.y, b.x - a.x)
            );

            return {p: a, q: {x: a.x + Math.cos(theta), y: a.y + Math.sin(theta)}};
        }
        init_target_line([a, b, c, d], diff1);

        function diff2([a, b, c, d]) {
            const theta = (
                - Math.atan2(c.y - a.y, c.x - a.x)
                + Math.atan2(d.y - a.y, d.x - a.x)
                + Math.atan2(b.y - a.y, b.x - a.x)
            );

            return {p: a, q: {x: a.x + Math.cos(theta), y: a.y + Math.sin(theta)}};
        }
        init_target_line([a, b, c, d], diff2);


        perform_action_callback = function(obj) {

            if (completed) { return; }
            if (!(obj instanceof Line)) { return; }

            let scope = {};

            function fails_random_test() {

                rand_points = get_random_points(4);
                scope[a.elem.id] = _a = rand_points[0];
                scope[b.elem.id] = _b = rand_points[1];
                scope[c.elem.id] = _c = rand_points[2];
                scope[d.elem.id] = _d = rand_points[3];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const ang = Math.atan2(_obj.q.y - _a.y, _obj.q.x - _a.x);

                const _sum = summation([_a, _b, _c, _d]);
                const ang_sum = Math.atan2(_sum.q.y - _sum.p.y, _sum.q.x - _sum.p.x);

                const _diff1 = diff1([_a, _b, _c, _d]);
                const ang_diff1 = Math.atan2(_diff1.q.y - _diff1.p.y, _diff1.q.x - _diff1.p.x);

                const _diff2 = diff2([_a, _b, _c, _d]);
                const ang_diff2 = Math.atan2(_diff2.q.y - _diff2.p.y, _diff2.q.x - _diff2.p.x);

                for (let i=-2; i < 4; i++) {
                    if (Math.abs(ang_sum - ang + i * Math.PI) < TEST_EPS) {
                        return false;
                    }
                    if (Math.abs(ang_diff1 - ang + i * Math.PI) < TEST_EPS) {
                        return false;
                    }
                    if (Math.abs(ang_diff2 - ang + i * Math.PI) < TEST_EPS) {
                        return false;
                    }
                }

                return true;
            }

            run_battery(fails_random_test, 100);
        }
    },
    "multiply": () => {
        // http://localhost:8000/geometry.html?init=multiply&state=lp2p1lp1p0lp0p2il1c2k1cp1p2cp2p1ic4c3k1ic4c3k0lp5p6cp6p4cp5p4ic6c5k0lp7p4il4l2k0cp0p8
        ALLOWFREE = false;

        let a = init_point(0, 0);
        let u = init_point(1, 0);
        let b = init_point(0, -1.5);
        let c = init_point(2, 0);

        let au = init_circle(a, u);
        let ab = init_circle(a, b);
        let ac = init_circle(a, c);

        function solution([a, u, b, c]) {

            let uu = Math.hypot(u.y - a.y, u.x - a.x);
            let bb = Math.hypot(b.y - a.y, b.x - a.x);
            let cc = Math.hypot(c.y - a.y, c.x - a.x);

            return {c: {x: a.x, y: a.y}, r: bb * cc / uu};
        }

        init_target_circle_cr([a, u, b, c], solution);

        perform_action_callback = function(obj) {

            if (completed) { return; }
            if (!(obj instanceof Circle)) { return; }

            let scope = {};
            function fails_random_test() {

                rand_points = get_random_points(4);
                scope[a.elem.id] = _a = rand_points[0];
                scope[u.elem.id] = _u = rand_points[1];
                scope[b.elem.id] = _b = rand_points[2];
                scope[c.elem.id] = _c = rand_points[3];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _u, _b, _c]);

                const _dc = Math.hypot(_obj.c.y - _sol.c.y, _obj.c.x - _sol.c.x);
                if (_dc > TEST_EPS) {
                    return true;
                }
                const _obj_r = Math.hypot(_obj.p.y - _obj.c.y, _obj.p.x - _obj.c.x);
                if (Math.abs(_obj_r - _sol.r) > TEST_EPS) {
                    return true;
                }

                return false;

            }
            run_battery(fails_random_test, 100);
        }
    },
    "invert": () => {
        // http://localhost:8000/geometry.html?init=invert&state=lp0p2lp2p1lp1p0il0c0k0il2c1k1lp3p4cp4p1cp3p1ic3c2k0lp1p5cp1p5ic4l4k1cp5p6cp6p5ic6c5k0ic6c5k1lp7p8il5l0k0cp0p9
        ALLOWFREE = false;

        let a = init_point(0, 0);
        let u = init_point(1, 0);
        let b = init_point(0, -1.5);

        let au = init_circle(a, u);
        let ab = init_circle(a, b);

        function solution([a, u, b]) {

            let uu = Math.hypot(u.y - a.y, u.x - a.x);
            let bb = Math.hypot(b.y - a.y, b.x - a.x);

            return {c: {x: a.x, y: a.y}, r: uu * uu / bb};
        }

        init_target_circle_cr([a, u, b], solution);

        perform_action_callback = function(obj) {

            if (completed) { return; }
            if (!(obj instanceof Circle)) { return; }

            let scope = {};
            function fails_random_test() {

                rand_points = get_random_points(4);
                scope[a.elem.id] = _a = rand_points[0];
                scope[u.elem.id] = _u = rand_points[1];
                scope[b.elem.id] = _b = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _u, _b]);

                const _dc = Math.hypot(_obj.c.y - _sol.c.y, _obj.c.x - _sol.c.x);
                if (_dc > TEST_EPS) {
                    return true;
                }
                const _obj_r = Math.hypot(_obj.p.y - _obj.c.y, _obj.p.x - _obj.c.x);
                if (Math.abs(_obj_r - _sol.r) > TEST_EPS) {
                    return true;
                }

                return false;

            }

            run_battery(fails_random_test, 100);
        }
    },
    "square-root": () => {
        // http://localhost:8000/geometry.html?init=square-root&state=lp0p2il0c0k1cp2p3cp3p2ic3c2k1ic3c2k0lp4p5ic0l0k0cp3p6cp6p3ic5c4k0ic5c4k1lp7p8il1l0k0cp9p3ic6l2k1cp0p10

        ALLOWFREE = false;

        let a = init_point(0, 0);
        let u = init_point(1, 0.5);
        let b = init_point(-2, 0);

        let au = init_circle(a, u);
        let ab = init_circle(a, b);

        function solution([a, u, b]) {

            let uu = Math.hypot(u.y - a.y, u.x - a.x);
            let bb = Math.hypot(b.y - a.y, b.x - a.x);

            return {c: {x: a.x, y: a.y}, r: Math.sqrt(bb * uu)};
        }

        init_target_circle_cr([a, u, b], solution);

        perform_action_callback = function(obj) {

            if (completed) { return; }
            if (!(obj instanceof Circle)) { return; }

            let scope = {};
            function fails_random_test() {

                rand_points = get_random_points(4);
                scope[a.elem.id] = _a = rand_points[0];
                scope[u.elem.id] = _u = rand_points[1];
                scope[b.elem.id] = _b = rand_points[2];

                const _obj = obj.as_function(scope);
                if (_obj === undefined) { return true; }

                const _sol = solution([_a, _u, _b]);

                const _dc = Math.hypot(_obj.c.y - _sol.c.y, _obj.c.x - _sol.c.x);
                if (_dc > TEST_EPS) {
                    return true;
                }
                const _obj_r = Math.hypot(_obj.p.y - _obj.c.y, _obj.p.x - _obj.c.x);
                if (Math.abs(_obj_r - _sol.r) > TEST_EPS) {
                    return true;
                }

                return false;

            }

            run_battery(fails_random_test, 100);
        }
    },
    "angle-trisector": () => {

        ALLOWFREE = false;

        let a = init_point(-1, 0);
        let b = init_point(1, 0);
        let c = init_point(0, -1);

        function sol1([a, b, c]) {
            let t1 = Math.atan2(b.y - a.y, b.x - a.x);
            let t2 = Math.atan2(c.y - a.y, c.x - a.x);

            let d = t2 - t1;
            while (d > Math.PI) {
                d -= 2 * Math.PI;
            }
            while (d < -Math.PI) {
                d += 2 * Math.PI;
            }
            let ang = t1 + d / 3;

            return {p: a, q: {x: a.x + Math.cos(ang), y: a.y + Math.sin(ang)}};
        }
        function sol2([a, b, c]) {
            let t1 = Math.atan2(b.y - a.y, b.x - a.x);
            let t2 = Math.atan2(c.y - a.y, c.x - a.x);

            let d = t2 - t1;
            while (d > Math.PI) {
                d -= 2 * Math.PI;
            }
            while (d < -Math.PI) {
                d += 2 * Math.PI;
            }
            let ang = t1 + 2 * d / 3;

            return {p: a, q: {x: a.x + Math.cos(ang), y: a.y + Math.sin(ang)}};
        }

        init_target_line([a, b, c], sol1);
        init_target_line([a, b, c], sol2);

    },
    "square-circle": () => {

        ALLOWFREE = false;

        let a = init_point(0, 0);
        let b = init_point(1, 0);

        init_circle(a, b);
        init_line(a, b);

        function s1([a, b]) {
            const dy = Math.sqrt(Math.PI) * (b.y - a.y);
            const dx = Math.sqrt(Math.PI) * (b.x - a.x);
            return {
                p: a,
                q: {x: a.x + dy, y: a.y - dx}
            };
        }
        function s2([a, b]) {
            const dy = Math.sqrt(Math.PI) * (b.y - a.y);
            const dx = Math.sqrt(Math.PI) * (b.x - a.x);
            return {
                p: {x: a.x + dy, y: a.y - dx},
                q: {x: b.x + dy, y: b.y - dx},
            };
        }
        function s3([a, b]) {
            const dy = Math.sqrt(Math.PI) * (b.y - a.y);
            const dx = Math.sqrt(Math.PI) * (b.x - a.x);
            return {
                p: {x: a.x + dy + dx, y: a.y - dx + dy},
                q: {x: a.x + dx, y: a.y + dy},
            };
        }
        init_target_line([a, b], s1);
        init_target_line([a, b], s2);
        init_target_line([a, b], s3);

    }
}

load_url();
