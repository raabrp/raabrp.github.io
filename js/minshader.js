// boilerplate for playing with shaders in WebGL
// (plus allowing full-screen toggle)
//
// assumes/assigns specific uniforms:
//
// * resolution
// * mouse position (vec2) (with default value)
// * mouse held (boolean)
//

function shade(shader_id) {

    var c = document.createElement('canvas');
    var l = document.createElement('a');
    var shader_el = document.getElementById(shader_id);
    var gl = c.getContext("webgl");
    var programInfo = twgl.createProgramInfo(gl, ["vs", shader_id]);
    var triangles = {
        // two triangles covering the unit square
        position: [-1, -1, 0,
                    1, -1, 0,
                   -1,  1, 0,
                   -1,  1, 0,
                    1, -1, 0,
                    1,  1, 0],
        };
    var bufferInfo = twgl.createBufferInfoFromArrays(gl, triangles);

    var render = function(uniforms) {
        twgl.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.useProgram(programInfo.program);
        twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
        twgl.setUniforms(programInfo, uniforms);
        twgl.drawBufferInfo(gl, bufferInfo);
    };

    var fs_style = "position: fixed; top: 0px; left: 0px;" +
        " width: 100%; height: 100%; z-index: 1;",
        inline_style = "width: 100%; height:400px; touch-action:none;";

    // insert canvas element after shader in document flow, followed
    // by fullscreen link
    onReady(function() {
        l.setAttribute('id', shader_id + '_fs');
        l.innerText = "View fullsrceen";
        c.setAttribute('id', shader_id + '_canvas');
        c.setAttribute('style', inline_style);
        shader_el.parentNode.insertBefore(l, shader_el.nextSibling);
        shader_el.parentNode.insertBefore(c, shader_el.nextSibling);
    });

    // bind fullscreen button with callback
    var fsbind = function(elid, onfullscreen, oninline) {
        // enter fullscreen on link click
        document.getElementById(elid).onclick = function() {
            c.setAttribute('style', fs_style);
            onfullscreen();
        };
        // exit fullscreen on canvas double click
        c.ondblclick = function(e) {
            e.preventDefault();
            c.setAttribute('style', inline_style);
            oninline();
        };
        // exit fullscreen on canvas double tap
        var tapedTwice = false;
        c.addEventListener("touchstart", function(event) {
            if(!tapedTwice) {
                tapedTwice = true;
                setTimeout( function() { tapedTwice = false; }, 300 );
                return false;
            }
            event.preventDefault();
            c.setAttribute('style', inline_style);
            oninline();
        });
        // exit fullscreen on escape key
        window.addEventListener('keydown', function(e){
            if((e.key=='Escape'||e.key=='Esc'||e.keyCode==27) &&
               (e.target.nodeName=='BODY')){
                c.setAttribute('style', inline_style);
                oninline();
            }
        }, true);
    };

    return {
        "gl": gl,
        "render": render,
        "fsbind": fsbind
    };

}
