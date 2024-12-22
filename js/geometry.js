/** BSD 3-Clause License

Copyright 2024 Reilly Raab

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


// during undo/redo, elem gets disassociated.
// intersections should not have to be recalculated on euclidean.remove.

const EPS = 0.0001
const RADIUS = 7
let ALLOWFREE = false;

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
    if (denominator === 0) {
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
    const r2 = F.r2;

    // distance between line and circle is Math.abs(c) / Math.sqrt(m) - B.r;
    // We care only about the sign of this distance, which is shared with
    const s = c * c - r2 * m;

    if (s > EPS) { // no intersections
        return [];
    } else if (s < EPS) { // two intersections
        const v = Math.sqrt((r2 - c * c / m) / m);
        // translate coordinates back!
        return [
            {x: -a * c / m + b * v + cx, y: -b * c / m - a * v + cy},
            {x: -a * c / m - b * v + cx, y: -b * c / m + a * v + cy}
        ];
    } else { // tangent point
        return [{x: -a * c / m + cx, y: -b * c / m + cy}];
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
    const f = (F.r2 - G.r2 + d2) / (2 * d2);
    const h2 = F.r2 / d2 - f * f;

    if (h2 < 0) {
        return [];
    } else if (h2 < EPS) {
        return [{x: x0 + f * dx, y: y0 + f * dy}];
    } else {
        const h = Math.sqrt(h2);
        return [
            {x: x0 + f * dx + h * dy, y: y0 + f * dy - h * dx},
            {x: x0 + f * dx - h * dy, y: y0 + f * dy + h * dx}
        ];
    }

}

// obj1: Line | Circle
// obj2: Line | Circle
function get_intersections(obj1, obj2) {
    if (obj1 instanceof Line) {
        if (obj2 instanceof Line) {
            return get_intersections_ll(obj1, obj2);
        }
        return get_intersections_lc(obj1, obj2);
    }
    if (obj2 instanceof Line) {
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
    }
    update({x, y}) {
        this.x = x;
        this.y = y;
        super.update();
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

        this.x = p.x
        this.y = p.y

        this.elem = elem;
    }
    update() {
        if (!this.reified) {
            this.remove();
            return;
        }
        const intersections = get_intersections(this.obj1, this.obj2)
        const vec = intersections[this.k];

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

}

let unchanged_euclidean = new Set();
let updated_euclidean = new Set();

// historically anachronistic, of course
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
    get r2() { // radius squared
        const dx = this.p.x - this.c.x;
        const dy = this.p.y - this.c.y;
        return dx * dx + dy * dy;
    }
    get r() {
        return Math.sqrt(this.r2)
    }

}

////////////////////////////////////////////////////////////////////////////////


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

///////////////////////////////////////////////////////////////////////////////



const svg = document.getElementById("geometry-svg");
const plane = document.getElementById("plane");
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
                // Allow wheel and pinch gestures
                if (event.type === "wheel" || event.type === "touchmove") {
                    return true;
                }
                // Exclude click, mousedown, and touchstart events
                // unless pan tool is selected
                else {
                    return (currentTool == "pan");
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
        if (event.ctrlKey && event.key === "z" && !event.shiftKey) {
            undo(); // Ctrl+Z
        } else if (event.ctrlKey && event.key === "Z" && event.shiftKey) {
            redo(); // Ctrl+Shift+Z
        }
    }
});


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

function perform(action) {
    const output = action();
    action_stack.push(action);
    redo_stack = [];
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
                console.log("Point.create");

                elem.setAttribute("id", `point-${this.counter}`);
                elem.classList.add("point");
                elem.update = handle_point_update(elem);
                elem.update();
                elem.setAttribute("r", RADIUS / zoomLevel);

                this.counter++;
                pointLayer.appendChild(elem);
                return elem.platonic;
            };
            action.undo = () => {
                console.log("Point.uncreate");
                this.counter--;
                const elem = document.getElementById(`point-${this.counter}`);
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
                console.log("Point.move");
                elem.platonic.update({ x, y });

                placeIntersections();
            };
            action.undo = () => {
                // rebind elem using id of closure's capture
                const elem = document.getElementById(elem_id);
                console.log("Point.unmove");
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
                console.log("Intersection.reify");

                elem.setAttribute("id", `point-${this.counter}`);
                elem.classList.add("point");
                elem.classList.add("intersection");
                elem.classList.add("reified");
                elem.update = handle_point_update(elem);
                elem.update();
                elem.setAttribute("r", RADIUS / zoomLevel);

                this.counter++;
                pointLayer.appendChild(elem);

                return elem.platonic;
            };
            action.undo = () => {

                console.log("Intersection.unname");
                this.counter--;
                const elem = document.getElementById(`point-${this.counter}`);
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
                console.log("Line.create");

                elem.setAttribute("id", `line-${this.counter}`);
                elem.update = () => {
                    if (elem.platonic.defined) {
                        elem.classList.remove("hidden");
                        let dx = elem.platonic.q.x - elem.platonic.p.x;
                        let dy = elem.platonic.q.y - elem.platonic.p.y;
                        let d = Math.sqrt(dx * dx + dy * dy);
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

                this.counter++;
                placeIntersections();

                return elem.platonic;
            }
            action.undo = () => {
                console.log("Line.uncreate");
                this.counter--;
                const elem = document.getElementById(`line-${this.counter}`);
                elem.platonic.remove();
            }

            return action;
        },
        render_ephemeral: function(p1, p2) {
            if (!tempElement) {
                tempElement = document.createElementNS("http://www.w3.org/2000/svg", "line");
                tempElement.classList.add("temp")
                lineLayer.appendChild(tempElement);
            }
            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let d = Math.sqrt(dx * dx + dy * dy);
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
                console.log("Circle.create");

                elem.setAttribute("id", `circle-${this.counter}`);
                elem.update = () => {
                    if (elem.platonic.defined) {
                        elem.classList.remove("hidden");
                        elem.setAttribute("cx", elem.platonic.c.x);
                        elem.setAttribute("cy", elem.platonic.c.y);
                        elem.setAttribute("r", elem.platonic.r);
                    } else {
                        elem.classList.add("hidden");
                    }
                }
                elem.update();
                circleLayer.appendChild(elem);

                this.counter++;
                placeIntersections();

                return elem.platonic;
            }
            action.undo = () => {
                console.log("Circle.uncreate");
                this.counter--;
                const elem = document.getElementById(`circle-${this.counter}`);
                elem.platonic.remove();
            }
            return action;
        },
        render_ephemeral: function(center, rad_point) {
            const radius = Math.sqrt((center.x - rad_point.x) ** 2 + (center.y - rad_point.y) ** 2);

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

let currentTool = "point";
document.getElementById(`${currentTool}-tool`).classList.add("active");

function get_vec(event) {
    const transform = d3.zoomTransform(svg); // Get the current transform
    const vecs = d3.pointer(event, svg); // Get mouse position in SVG
    const inverted = transform.invert(vecs); // Invert to original space
    return { x: inverted[0], y: inverted[1] };
}

svg.addEventListener("mousedown", (event) => {
    let vec;
    if (event.target.classList.contains("point")) {
        vec = event.target.platonic;
    } else {
        vec = get_vec(event);
    }
    tools[currentTool].mousedown(vec);
});
svg.addEventListener("touchstart", (event) => {
    let vec;
    if (event.target.classList.contains("point")) {
        vec = event.target.platonic;
    } else {
        vec = get_vec(event);
    }
    tools[currentTool].mousedown(vec);
});

svg.addEventListener("mousemove", (event) => {
    const vec = get_vec(event);
    tools[currentTool].mousemove(vec);
});
svg.addEventListener("touchmove", (event) => {
    const vec = get_vec(event);
    tools[currentTool].mousemove(vec);
});

svg.addEventListener("mouseup", (event) => {
    const vec = get_vec(event);
    tools[currentTool].mouseup(vec);
});
svg.addEventListener("touchend", (event) => {
    const vec = get_vec(event);
    tools[currentTool].mouseup(vec);
});

svg.addEventListener("touchcancel", (event) => {
    cancelConstruction();
});

////////////////////////////////////////////////////////////////////////////////
// Manual state initialization

let origin = {x: svg.width.baseVal.value / 2, y: svg.height.baseVal.value / 2}
let unit = 100;

function make_point(x, y) {
    return tools["point"].act_create(
        {x: origin.x + unit * x, y: origin.y + unit * y}
    )(); // no undo
}
function make_line(p1, p2) {
    return tools["line"].act_create(p1, p2)();
}
function make_circle(c, r) {
    return tools["circle"].act_create(c, r)();
}
function intersect(obj1, obj2, k) {
    return tools["point"].act_intersect(obj1, obj2, k)();
}

// ----------------------------------------------------------------------

ALLOWFREE = true;

// HERE: Code development in progress.

// initial state (no undo)

// p = make_point(0, 0);
// q = make_point(1, 0);
// c1 = make_circle(p, q);
// c2 = make_circle(q, p);
// i1 = intersect(c1, c2, 0);
// i2 = intersect(c1, c2, 1);
// l = make_line(i1, i2);
