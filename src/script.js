// @ts-check

const workSpace = WorkSpace();

function WorkSpace() {
    const ZOOM_FACTOR = 1.2;
    const ZOOM_MAX = 1000;
    const ZOOM_MIN = 1 / 64;
    const ZOOM_FORCE_PIXEL_PERFECT = false;
    const SHIFT_TO_ZOOM = false;
    /** @type {HTMLElement} */
    const box = document.querySelector('div.workSpace');
    const cnv = box.appendChild(document.createElement('canvas'));
    // cnv.style.transformOrigin = '0 0';
    const ctx = cnv.getContext('2d', { alpha: false });
    const xfm = Transform();
    const panLock = PanLock();
    /** @type {ImageData} */
    let pix;
    init();
    return { load, refresh };

    function Transform() {
        let [_left, _top, _scale] = [0, 0, 1];
        return { apply, set, get, pan, zoom, cnvCoord };
        function apply() {
            const bcr = box.getBoundingClientRect();
            // Clamp transforms that go past the edge of the work space.
            _left = Math.min(Math.max(_left, 32 - (cnv.width * _scale)), bcr.width - 32);
            _top = Math.min(Math.max(_top, 32 - (cnv.height * _scale)), bcr.height - 32);
            cnv.style.transform = `translate(${_left}px, ${_top}px) scale(${_scale})`;
        };
        /** @param {number} left @param {number} top @param {number} scale */
        function set(left, top, scale) {
            [_left, _top, _scale] = [left, top, scale];
            // console.log(_left, _top, _scale);
            apply();
        };
        function get() {
            return [_left, _top, _scale];
        }
        /** @param {number} dx @param {number} dy */
        function pan(dx, dy) {
            set(_left + dx, _top + dy, _scale);
        }
        //** @param {boolean} invert @param {number} cx @param {number} cy */
        function zoom(invert = false, cx = box.offsetWidth / 2, cy = box.offsetHeight / 2) {
            const factor = invert ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
            const newScale = _scale * factor;
            if (ZOOM_MIN <= newScale && newScale <= ZOOM_MAX) {
                set((_left - cx) * factor + cx, (_top - cy) * factor + cy, newScale);
            }
        }
        /** @param {number} boxX @param {number} boxY @description Convert box coords to cnv coords. */
        function cnvCoord(boxX, boxY) {
            const [x, y] = [(boxX - _left) / _scale, (boxY - _top) / _scale];
            const over = 0 <= x && x < cnv.width && 0 <= y && y < cnv.height;
            const point = over ? Math.floor(y) * cnv.width + Math.floor(x) : null;
            return { x, y, over, point };
        }
    }

    function PanLock() {
        let phase = 0;
        return { start, end, drag };
        function onLock() {
            document.removeEventListener('pointerlockchange', onLock);
            document.addEventListener('pointerlockchange', end);
            document.addEventListener('pointerlockerror', end);
            phase = 1;
        }
        function start() {
            box.requestPointerLock();
            document.addEventListener('pointerlockchange', onLock);
            document.addEventListener('pointerlockerror', end);
        }
        function end() {
            document.removeEventListener('pointerlockchange', onLock);
            if (document.pointerLockElement) {
                document.exitPointerLock();
            } else {
                document.removeEventListener('pointerlockchange', end);
                document.removeEventListener('pointerlockerror', end);
                phase = 0;
            }
        }
        /** @param {number} dx @param {number} dy */
        function drag(dx, dy) {
            if (phase && phase++ > 1 && (dx || dy)) {
                xfm.pan(dx, dy);
            }
        }
    }

    /** @param {MouseEvent} evt */
    function mouse(evt) {
        const mod = evt.ctrlKey || evt.shiftKey || evt.altKey;
        const bcr = box.getBoundingClientRect();
        const dpr = devicePixelRatio;
        const [x, y] = [evt.x - bcr.x, evt.y - bcr.y];
        if (evt.button === 1 && evt.type === 'mousedown' && !mod) {
            panLock.start();
        } else if (evt.buttons === 4 && evt.type === 'mousemove' && !mod) {
            panLock.drag(-evt.movementX / dpr, -evt.movementY / dpr)
        } else {
            if (evt.button === 1 && evt.type === 'mouseup') {
                panLock.end();
            }
            // g.app.mouse(evt, xfm.cnvCoord(x, y));
        }
    }

    /** @param {WheelEvent} evt */
    function wheel(evt) {
        const bcr = box.getBoundingClientRect();
        const [x, y] = [evt.x - bcr.x, evt.y - bcr.y];
        if (evt.deltaY && !(evt.ctrlKey || evt.shiftKey || evt.altKey)) {
            xfm.zoom(evt.deltaY > 0, x, y)
        }
    }

    /**@param {KeyboardEvent} evt*/
    function keyboard(evt) {
        const mod = evt.ctrlKey || evt.shiftKey || evt.altKey;
        switch (evt.key) {
            case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
                if (evt.type === 'keydown' && !mod) {
                    const STEP = 32;
                    xfm.pan(
                        STEP * (+(evt.key === 'ArrowLeft') - +(evt.key === 'ArrowRight')),
                        STEP * (+(evt.key === 'ArrowUp') - +(evt.key === 'ArrowDown'))
                    );
                }
                break;
            case 'Home': case 'F':
                fit(false);
                break;
            case 'End': case 'f':
                fit(true);
                break;
            case '+': case '=':
                if (evt.type === 'keydown' && !mod) {
                    xfm.zoom(false);
                }
                break;
            case '-':
                if (evt.type === 'keydown' && !mod) {
                    xfm.zoom(true);
                }
                break;
            case 'm':
                if (evt.type === 'keydown' && !mod) {
                    // setApp();
                }
                break;
            default:
                // g.app.keyboard(evt);
                break;
        }
    }

    /** @param {UIEvent|boolean} unscaled */
    function fit(unscaled = false) {
        const dpr = devicePixelRatio;
        const [cnvWidth, cnvHeight] = [cnv.width, cnv.height];
        const [mw, mh] = [box.clientWidth * dpr, box.clientHeight * dpr];
        let fitScale = Math.min(mw / cnvWidth, mh / cnvHeight);
        fitScale = Math.pow(2, Math.floor(Math.log(fitScale) / Math.log(2)));
        let scale = unscaled === true ? 1 : fitScale;
        const cnvLeft = Math.floor(mw / 2 - (cnvWidth * scale) / 2);
        const cnvTop = Math.floor(mh / 2 - (cnvHeight * scale) / 2);
        xfm.set(Math.floor(cnvLeft / dpr), Math.floor(cnvTop / dpr), scale / dpr);
    }

    /** @param {FocusEvent} evt */
    function blur(evt) {
        if (!evt.relatedTarget) {
            box.focus();
        }
    }

    function refresh() {
        ctx.putImageData(pix, 0, 0);
    }

    /** @param {number} width @param {number} height */
    function load(width, height) {
        [cnv.width, cnv.height] = [width, height];
        pix = new ImageData(width, height);
        fit();
        refresh();
        return new Uint32Array(pix.data.buffer);
    }

    function init() {
        box.addEventListener('mousedown', mouse);
        // document.body.addEventListener('mousedown', $diagClick);
        box.addEventListener('mousemove', mouse);
        box.addEventListener('wheel', wheel);
        box.addEventListener('mouseup', mouse);
        box.addEventListener('keydown', keyboard);
        window.addEventListener('resize', fit)
        box.addEventListener('blur', blur);
    }

    /** @param {MouseEvent} evt */
    function $diagClick(evt) {
        const bcr = box.getBoundingClientRect();
        console.dir(bcr);
        console.log(evt.x - bcr.x)
    }
}

/** @param {()=>void} cb */
function makeAFJob(cb, loop = false) {
    let pending;
    const loopFn = () => { cb(); pending = requestAnimationFrame(loopFn); };
    const onceFn = () => { cb(); pending = false; };
    const attachAFJob = () => pending = pending || requestAnimationFrame(loop ? loopFn : onceFn);
    const detachAFJob = () => pending = pending && cancelAnimationFrame(pending);
    return { attachAFJob, detachAFJob };
}


