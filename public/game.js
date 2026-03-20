// Run Kitty Run! — Client-side 3D game code (Three.js)

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════

    const WORLD_WIDTH = 4800;
    const WORLD_HEIGHT = 4800;
    const WALL_THICKNESS = 20;
    const CORRIDOR_WIDTH = 400;
    const KITTEN_RADIUS = 16;
    const DOG_RADIUS = 25;

    const CAM_BASE_HEIGHT = 1100;
    const CAM_TILT_FACTOR = 0.45;
    const CAM_FOV = 50;

    // Hop animation
    const KITTEN_HOP_SPEED = 0.22;
    const KITTEN_HOP_HEIGHT = 6;
    const DOG_HOP_SPEED = 0.18;
    const DOG_HOP_HEIGHT = 4.5;

    // ═══════════════════════════════════════════════════════════
    // SOUND SYSTEM
    // ═══════════════════════════════════════════════════════════

    const SFX = {
        ctx: null,
        initialized: false,
        init() {
            if (this.initialized) return;
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.initialized = true; } catch (e) { }
        },
        play(type) {
            if (!this.ctx) this.init();
            if (!this.ctx) return;
            const c = this.ctx, now = c.currentTime;
            try {
                switch (type) {
                    case 'caught': {
                        const o = c.createOscillator(), g = c.createGain();
                        o.connect(g); g.connect(c.destination); o.type = 'sine';
                        o.frequency.setValueAtTime(950, now); o.frequency.exponentialRampToValueAtTime(180, now + 0.45);
                        g.gain.setValueAtTime(0.18, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                        o.start(now); o.stop(now + 0.45);
                        const o2 = c.createOscillator(), g2 = c.createGain();
                        o2.connect(g2); g2.connect(c.destination); o2.type = 'triangle';
                        o2.frequency.setValueAtTime(1200, now); o2.frequency.exponentialRampToValueAtTime(250, now + 0.35);
                        g2.gain.setValueAtTime(0.06, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                        o2.start(now); o2.stop(now + 0.35);
                        break;
                    }
                    case 'revived': {
                        [520, 660, 780, 1040].forEach((freq, i) => {
                            const o = c.createOscillator(), g = c.createGain();
                            o.connect(g); g.connect(c.destination); o.type = 'sine';
                            const t = now + i * 0.08;
                            o.frequency.setValueAtTime(freq, t); g.gain.setValueAtTime(0.1, t);
                            g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                            o.start(t); o.stop(t + 0.25);
                        });
                        break;
                    }
                    case 'goal': {
                        [523, 659, 784, 1047].forEach((freq, i) => {
                            const o = c.createOscillator(), g = c.createGain();
                            o.connect(g); g.connect(c.destination); o.type = i < 2 ? 'sine' : 'triangle';
                            o.frequency.setValueAtTime(freq, now); g.gain.setValueAtTime(0.08, now);
                            g.gain.linearRampToValueAtTime(0.06, now + 0.3);
                            g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
                            o.start(now); o.stop(now + 1.2);
                        });
                        break;
                    }
                }
            } catch (e) { }
        }
    };

    // ═══════════════════════════════════════════════════════════
    // THREE.JS STATE
    // ═══════════════════════════════════════════════════════════

    let scene, renderer3d, camera3d;
    let ambientLight, dirLight, goalLight;
    let kittenMeshes = {};
    let dogMeshes = {};
    let deathMarkers = {};
    let goalPulse = 0;
    let mazeZones = [];
    let frameTick = 0;
    let rendererReady = false;
    let mouseCanvasX = 0, mouseCanvasY = 0;

    // Track previous positions for movement detection
    let prevPositions = {};
    let rightMouseHeld = false;

    // Visual rotation smoothing (per entity)
    const visualAngles = {};
    const ROTATION_LERP_SPEED = 0.18; // 0-1, higher = snappier

    function lerpAngle(current, target, t) {
        let da = target - current;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        return current + da * t;
    }

    // GLB model system
    let catTemplate = null;
    let wolfTemplate = null;
    let catAnimations = null;
    let wolfAnimations = null;
    let animMixers = {};  // entity id -> AnimationMixer
    let lastTime = 0;

    const CAT_TARGET_HEIGHT = 31.25;   // 25% larger visual model
    const WOLF_TARGET_HEIGHT = 65.625; // 25% larger visual model
    let catScaleFactor = 1;
    let wolfScaleFactor = 1;

    const gameCanvas = document.getElementById('game-canvas');
    document.getElementById('game-container').addEventListener('mousemove', (e) => {
        const rect = gameCanvas.getBoundingClientRect();
        mouseCanvasX = (e.clientX - rect.left) * (1920 / rect.width);
        mouseCanvasY = (e.clientY - rect.top) * (1080 / rect.height);
    });

    // ═══════════════════════════════════════════════════════════
    // PROCEDURAL TEXTURES
    // ═══════════════════════════════════════════════════════════

    function createStoneTexture() {
        const sz = 512;
        const cv = document.createElement('canvas');
        cv.width = sz; cv.height = sz;
        const c = cv.getContext('2d');

        // Base stone color
        c.fillStyle = '#6b6b78';
        c.fillRect(0, 0, sz, sz);

        // Stone block pattern
        const bw = 64, bh = 32;
        for (let y = 0; y < sz; y += bh) {
            const offset = (Math.floor(y / bh) % 2) * (bw / 2);
            for (let x = -bw; x < sz + bw; x += bw) {
                const bx = x + offset;
                // Individual stone color variation
                const v = Math.random() * 20 - 10;
                c.fillStyle = `rgb(${97 + v},${97 + v},${108 + v})`;
                c.fillRect(bx + 2, y + 2, bw - 4, bh - 4);

                // Subtle noise within each stone
                for (let i = 0; i < 8; i++) {
                    const nx = bx + 2 + Math.random() * (bw - 4);
                    const ny = y + 2 + Math.random() * (bh - 4);
                    const nv = Math.random() * 0.08;
                    c.fillStyle = `rgba(255,255,255,${nv})`;
                    c.fillRect(nx, ny, 3, 3);
                }
            }
            // Mortar lines (horizontal)
            c.fillStyle = 'rgba(40,40,50,0.5)';
            c.fillRect(0, y, sz, 2);
        }

        // Vertical mortar lines
        for (let y = 0; y < sz; y += bh) {
            const offset = (Math.floor(y / bh) % 2) * (bw / 2);
            for (let x = -bw; x < sz + bw; x += bw) {
                c.fillStyle = 'rgba(40,40,50,0.5)';
                c.fillRect(x + offset, y, 2, bh);
            }
        }

        // Scattered cracks
        c.strokeStyle = 'rgba(30,30,40,0.4)';
        c.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const sx = Math.random() * sz, sy = Math.random() * sz;
            c.beginPath();
            c.moveTo(sx, sy);
            let cx = sx, cy = sy;
            for (let j = 0; j < 4; j++) {
                cx += (Math.random() - 0.5) * 30;
                cy += Math.random() * 20;
                c.lineTo(cx, cy);
            }
            c.stroke();
        }

        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function createGrassTexture() {
        const sz = 512;
        const cv = document.createElement('canvas');
        cv.width = sz; cv.height = sz;
        const c = cv.getContext('2d');

        // Base green
        c.fillStyle = '#3a7a28';
        c.fillRect(0, 0, sz, sz);

        // Grass blade clusters
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * sz;
            const y = Math.random() * sz;
            const h = 4 + Math.random() * 8;
            const lean = (Math.random() - 0.5) * 4;
            const g = 90 + Math.random() * 50;
            const r = 30 + Math.random() * 30;
            c.strokeStyle = `rgb(${r},${g},${Math.floor(r * 0.4)})`;
            c.lineWidth = 0.8 + Math.random() * 0.8;
            c.beginPath();
            c.moveTo(x, y);
            c.quadraticCurveTo(x + lean * 0.5, y - h * 0.6, x + lean, y - h);
            c.stroke();
        }

        // Light patches (sunlight dappling)
        for (let i = 0; i < 15; i++) {
            const x = Math.random() * sz;
            const y = Math.random() * sz;
            const r = 15 + Math.random() * 30;
            const grad = c.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(120,180,60,0.15)');
            grad.addColorStop(1, 'transparent');
            c.fillStyle = grad;
            c.fillRect(x - r, y - r, r * 2, r * 2);
        }

        // Dark patches
        for (let i = 0; i < 10; i++) {
            const x = Math.random() * sz;
            const y = Math.random() * sz;
            const r = 10 + Math.random() * 25;
            const grad = c.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(20,50,10,0.12)');
            grad.addColorStop(1, 'transparent');
            c.fillStyle = grad;
            c.fillRect(x - r, y - r, r * 2, r * 2);
        }

        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function createObsidianTexture() {
        const sz = 512;
        const cv = document.createElement('canvas');
        cv.width = sz; cv.height = sz;
        const c = cv.getContext('2d');

        // Deep black base
        c.fillStyle = '#080810';
        c.fillRect(0, 0, sz, sz);

        // Subtle dark brick pattern
        const bw = 48, bh = 24;
        for (let y = 0; y < sz; y += bh) {
            const offset = (Math.floor(y / bh) % 2) * (bw / 2);
            for (let x = -bw; x < sz + bw; x += bw) {
                const bx = x + offset;
                const v = Math.random() * 8;
                c.fillStyle = `rgb(${10 + v},${10 + v},${16 + v})`;
                c.fillRect(bx + 1, y + 1, bw - 2, bh - 2);
            }
            // Dark mortar
            c.fillStyle = 'rgba(0,0,0,0.6)';
            c.fillRect(0, y, sz, 1);
        }
        for (let y = 0; y < sz; y += bh) {
            const offset = (Math.floor(y / bh) % 2) * (bw / 2);
            for (let x = -bw; x < sz + bw; x += bw) {
                c.fillStyle = 'rgba(0,0,0,0.6)';
                c.fillRect(x + offset, y, 1, bh);
            }
        }

        // Glowing cracks (red/orange emissive look)
        c.lineCap = 'round';
        for (let i = 0; i < 10; i++) {
            const sx = Math.random() * sz, sy = Math.random() * sz;
            // Glow layer (wider, transparent)
            c.strokeStyle = 'rgba(180,40,20,0.12)';
            c.lineWidth = 5;
            c.beginPath();
            c.moveTo(sx, sy);
            let cx = sx, cy = sy;
            for (let j = 0; j < 5; j++) {
                cx += (Math.random() - 0.5) * 40;
                cy += (Math.random() - 0.5) * 40;
                c.lineTo(cx, cy);
            }
            c.stroke();

            // Core crack (thin, brighter)
            c.strokeStyle = 'rgba(220,80,20,0.2)';
            c.lineWidth = 1.5;
            c.beginPath();
            cx = sx; cy = sy;
            c.moveTo(sx, sy);
            for (let j = 0; j < 5; j++) {
                cx += (Math.random() - 0.5) * 40;
                cy += (Math.random() - 0.5) * 40;
                c.lineTo(cx, cy);
            }
            c.stroke();
        }

        // Faint ember glow spots
        for (let i = 0; i < 8; i++) {
            const x = Math.random() * sz, y = Math.random() * sz;
            const r = 5 + Math.random() * 15;
            const grad = c.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(160,40,10,0.08)');
            grad.addColorStop(1, 'transparent');
            c.fillStyle = grad;
            c.fillRect(x - r, y - r, r * 2, r * 2);
        }

        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function createGoalTexture() {
        const sz = 512;
        const cv = document.createElement('canvas');
        cv.width = sz; cv.height = sz;
        const c = cv.getContext('2d');

        // Golden base
        c.fillStyle = '#8a7020';
        c.fillRect(0, 0, sz, sz);

        // Ornate tile pattern
        const ts = 64;
        for (let y = 0; y < sz; y += ts) {
            for (let x = 0; x < sz; x += ts) {
                const v = Math.random() * 15;
                c.fillStyle = `rgb(${138 + v},${112 + v},${32 + v})`;
                c.fillRect(x + 2, y + 2, ts - 4, ts - 4);

                // Inner highlight
                c.fillStyle = 'rgba(255,220,80,0.08)';
                c.fillRect(x + 6, y + 6, ts - 12, ts - 12);
            }
            c.fillStyle = 'rgba(100,80,20,0.3)';
            c.fillRect(0, y, sz, 2);
        }
        for (let x = 0; x < sz; x += ts) {
            c.fillStyle = 'rgba(100,80,20,0.3)';
            c.fillRect(x, 0, 2, sz);
        }

        // Radial golden glow
        const grad = c.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
        grad.addColorStop(0, 'rgba(255,220,60,0.15)');
        grad.addColorStop(1, 'transparent');
        c.fillStyle = grad;
        c.fillRect(0, 0, sz, sz);

        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    // ═══════════════════════════════════════════════════════════
    // SHARED GEOMETRIES & MATERIALS
    // ═══════════════════════════════════════════════════════════

    let GEO = null;
    let MAT = null;

    function initSharedAssets() {
        GEO = {
            kittenBody: new THREE.SphereGeometry(11, 12, 8),
            kittenHead: new THREE.SphereGeometry(7.5, 10, 8),
            kittenEar: new THREE.ConeGeometry(3.2, 7, 4),
            kittenEye: new THREE.SphereGeometry(1.8, 6, 6),
            kittenPupil: new THREE.SphereGeometry(1.0, 6, 6),
            kittenNose: new THREE.SphereGeometry(1.2, 6, 6),
            kittenTail: new THREE.CylinderGeometry(1.5, 0.5, 18, 6),
            dogBody: new THREE.SphereGeometry(14, 12, 8),
            dogHead: new THREE.SphereGeometry(9, 10, 8),
            dogEar: new THREE.SphereGeometry(5, 8, 6),
            dogSnout: new THREE.SphereGeometry(5, 8, 6),
            dogNose: new THREE.SphereGeometry(2, 6, 6),
            dogEye: new THREE.SphereGeometry(2, 6, 6),
            dogTail: new THREE.CylinderGeometry(2, 1, 12, 6),
            shadow: new THREE.CircleGeometry(16, 16),
            deathRing: new THREE.RingGeometry(14, 22, 24),
            deathInner: new THREE.CircleGeometry(14, 24),
            paw: new THREE.SphereGeometry(3, 6, 6),
            pawToe: new THREE.SphereGeometry(1.8, 5, 5),
        };

        // Ground textures (use preloaded PNGs if available, fall back to procedural)
        const stoneTex = preloadedTextures.safe || createStoneTexture();
        stoneTex.repeat.set(4, 4);
        const grassTex = preloadedTextures.danger || createGrassTexture();
        grassTex.repeat.set(4, 4);
        const obsidianTex = preloadedTextures.void || createObsidianTexture();
        obsidianTex.repeat.set(12, 12);
        const goalTex = preloadedTextures.goal || createGoalTexture();
        goalTex.repeat.set(3, 3);

        MAT = {
            shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
            dogBody: new THREE.MeshPhongMaterial({ color: 0x8B6914, shininess: 20 }),
            dogDark: new THREE.MeshPhongMaterial({ color: 0x6B4E10, shininess: 10 }),
            dogLight: new THREE.MeshPhongMaterial({ color: 0xC4A060, shininess: 30 }),
            dogNose: new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 }),
            dogEye: new THREE.MeshPhongMaterial({ color: 0x1a1008, shininess: 40 }),
            eyeWhite: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }),
            pupil: new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 40 }),
            nosePink: new THREE.MeshPhongMaterial({ color: 0xffaaaa, shininess: 40 }),
            safeGround: new THREE.MeshPhongMaterial({ map: stoneTex, shininess: 8 }),
            dangerGround: new THREE.MeshPhongMaterial({ map: grassTex, shininess: 5 }),
            goalGround: new THREE.MeshPhongMaterial({ map: goalTex, shininess: 15, emissive: 0x443300, emissiveIntensity: 0.2 }),
            voidGround: new THREE.MeshPhongMaterial({ map: obsidianTex, shininess: 3 }),
            zoneBorder: new THREE.MeshBasicMaterial({ color: 0x88ff66, transparent: true, opacity: 0.15, depthWrite: false }),
        };
    }

    // ═══════════════════════════════════════════════════════════
    // TEXTURE & MODEL LOADING
    // ═══════════════════════════════════════════════════════════

    // Preloaded ground textures (populated by preload, used by initSharedAssets)
    let preloadedTextures = {};

    function loadGameTexture(path) {
        const texLoader = new THREE.TextureLoader();
        const tex = texLoader.load(path);
        tex.flipY = false;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function loadTextureAsync(path) {
        return new Promise((resolve, reject) => {
            const texLoader = new THREE.TextureLoader();
            texLoader.load(path, (tex) => {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                resolve(tex);
            }, undefined, (err) => {
                console.error('Failed to load texture:', path, err);
                reject(err);
            });
        });
    }

    function loadGroundTextures() {
        return Promise.all([
            loadTextureAsync('Textures/Summer_Flowers.png').then(t => { preloadedTextures.safe = t; }),
            loadTextureAsync('Textures/Summer_Grass_A.png').then(t => { preloadedTextures.danger = t; }),
            loadTextureAsync('Textures/Winter_FrozenGround.png').then(t => { preloadedTextures.void = t; }),
            loadTextureAsync('Textures/Summer_Roses.png').then(t => { preloadedTextures.goal = t; }),
        ]);
    }

    function loadGLBModels() {
        const loader = new THREE.GLTFLoader();
        const promises = [];

        // Load Cat model
        promises.push(new Promise((resolve, reject) => {
            loader.load('models/cat/Cat.glb', (gltf) => {
                const model = gltf.scene;
                const diffuse = loadGameTexture('models/cat/T_Cat_Gr_D.png');
                const normal = loadGameTexture('models/cat/T_Cat_N.png');

                model.traverse((child) => {
                    if (child.isSkinnedMesh || child.isMesh) {
                        child.material = new THREE.MeshStandardMaterial({
                            map: diffuse,
                            normalMap: normal,
                            roughness: 0.7,
                            metalness: 0.05,
                            skinning: child.isSkinnedMesh,
                        });
                    }
                });

                model.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                catScaleFactor = CAT_TARGET_HEIGHT / size.y;

                catTemplate = model;
                catAnimations = gltf.animations;
                console.log('Cat GLB loaded, animations:', catAnimations.map(a => a.name));
                resolve();
            }, undefined, (err) => { console.error('Failed to load Cat GLB:', err); reject(err); });
        }));

        // Load Wolf model
        promises.push(new Promise((resolve, reject) => {
            loader.load('models/wolf/Wolf.glb', (gltf) => {
                const model = gltf.scene;
                const diffuse = loadGameTexture('models/wolf/T_Wolf_Gr_D.png');
                const normal = loadGameTexture('models/wolf/T_Wolf_N.png');

                model.traverse((child) => {
                    if (child.isSkinnedMesh || child.isMesh) {
                        child.material = new THREE.MeshStandardMaterial({
                            map: diffuse,
                            normalMap: normal,
                            roughness: 0.7,
                            metalness: 0.05,
                            skinning: child.isSkinnedMesh,
                        });
                    }
                });

                model.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                wolfScaleFactor = WOLF_TARGET_HEIGHT / size.y;

                wolfTemplate = model;
                wolfAnimations = gltf.animations;
                console.log('Wolf GLB loaded, animations:', wolfAnimations.map(a => a.name));
                resolve();
            }, undefined, (err) => { console.error('Failed to load Wolf GLB:', err); reject(err); });
        }));

        return Promise.all(promises);
    }

    function cloneModel(template) {
        return THREE.SkeletonUtils.clone(template);
    }

    function findAnimation(clips, name) {
        return clips.find(c => c.name.includes(name));
    }

    // ═══════════════════════════════════════════════════════════
    // MAZE GENERATION (mirrors server algorithm)
    // ═══════════════════════════════════════════════════════════

    function generateMazeClient() {
        const result = [];
        const step = CORRIDOR_WIDTH + WALL_THICKNESS;
        let order = 0, r = 0;
        while (true) {
            const L = r * step, T = r * step;
            const R = WORLD_WIDTH - r * step, B = WORLD_HEIGHT - r * step;
            const CW = CORRIDOR_WIDTH;
            if (R - L <= 2 * CW) break;
            result.push({ type: 'safe', x: L, y: T, w: CW, h: CW, order: order++ });
            result.push({ type: 'danger', x: L + CW, y: T, w: R - L - 2 * CW, h: CW, order: order++ });
            result.push({ type: 'safe', x: R - CW, y: T, w: CW, h: CW, order: order++ });
            result.push({ type: 'danger', x: R - CW, y: T + CW, w: CW, h: B - T - 2 * CW, order: order++ });
            result.push({ type: 'safe', x: R - CW, y: B - CW, w: CW, h: CW, order: order++ });
            result.push({ type: 'danger', x: L + CW, y: B - CW, w: R - L - 2 * CW, h: CW, order: order++ });
            result.push({ type: 'safe', x: L, y: B - CW, w: CW, h: CW, order: order++ });
            const nextRingTop = (r + 1) * step;
            const leftTop = nextRingTop + CW, leftBottom = B - CW;
            if (leftBottom > leftTop) {
                result.push({ type: 'danger', x: L, y: leftTop, w: CW, h: leftBottom - leftTop, order: order++ });
            }
            result.push({ type: 'safe', x: L, y: nextRingTop, w: CW + WALL_THICKNESS, h: CW, order: order++ });
            r++;
        }
        const gL = r * step, gT = r * step;
        const gR = WORLD_WIDTH - r * step, gB = WORLD_HEIGHT - r * step;
        if (gR > gL && gB > gT) {
            result.push({ type: 'goal', x: gL, y: gT, w: gR - gL, h: gB - gT, order: order++ });
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════
    // MODEL FACTORIES (bodyGroup pattern for hop animation)
    // ═══════════════════════════════════════════════════════════

    function makeHitboxRing(r, color) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(r - 2, r, 32),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.name = 'hitboxRing';
        return ring;
    }

    function createKittenModel(color) {
        const group = new THREE.Group();
        group.add(makeHitboxRing(KITTEN_RADIUS, color));

        if (catTemplate) {
            const model = cloneModel(catTemplate);
            model.scale.setScalar(catScaleFactor);

            // Enable shadow casting on all meshes
            model.traverse((child) => {
                if (child.isMesh || child.isSkinnedMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            model.name = 'glbModel';
            group.add(model);

            // Set up animation mixer with idle + run + death
            const mixer = new THREE.AnimationMixer(model);
            const runClip = findAnimation(catAnimations, 'Run_Forward');
            const idleClip = findAnimation(catAnimations, 'Idle01') || findAnimation(catAnimations, 'idle');
            const deathClip = findAnimation(catAnimations, 'Death');
            const runAction = runClip ? mixer.clipAction(runClip) : null;
            const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
            const deathAction = deathClip ? mixer.clipAction(deathClip) : null;
            if (deathAction) { deathAction.setLoop(THREE.LoopOnce); deathAction.clampWhenFinished = true; }
            if (idleAction) idleAction.play();
            group.userData.mixer = mixer;
            group.userData.runAction = runAction;
            group.userData.idleAction = idleAction;
            group.userData.deathAction = deathAction;
            group.userData.currentAnim = 'idle';
            group.userData.isGLB = true;
        } else {
            // Fallback: procedural kitten
            const col = new THREE.Color(color);
            const bm = new THREE.MeshPhongMaterial({ color: col, shininess: 25 });
            const lc = col.clone().lerp(new THREE.Color(0xffffff), 0.3);
            const cm = new THREE.MeshPhongMaterial({ color: lc, shininess: 20 });
            const ei = new THREE.MeshPhongMaterial({ color: lc.clone().lerp(new THREE.Color(0xffcccc), 0.3), shininess: 15 });
            const bg = new THREE.Group(); bg.name = 'bodyGroup';
            const body = new THREE.Mesh(GEO.kittenBody, bm);
            body.scale.set(1, 0.75, 0.88); body.position.y = 9; bg.add(body);
            const head = new THREE.Mesh(GEO.kittenHead, bm);
            head.position.set(10, 12, 0); bg.add(head);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), cm);
            chest.position.set(4, 7, 0); bg.add(chest);
            [[-4, 0.2], [4, -0.2]].forEach(([z, rz]) => {
                const e = new THREE.Mesh(GEO.kittenEar, bm);
                e.position.set(12, 19, z); e.rotation.z = rz; bg.add(e);
                const i = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4, 4), ei);
                i.position.set(12, 18.5, z); i.rotation.z = rz; bg.add(i);
            });
            [[-3], [3]].forEach(([z]) => {
                const eye = new THREE.Mesh(GEO.kittenEye, MAT.eyeWhite);
                eye.position.set(15, 13, z); bg.add(eye);
                const pup = new THREE.Mesh(GEO.kittenPupil, MAT.pupil);
                pup.position.set(16.2, 13, z); bg.add(pup);
            });
            const nose = new THREE.Mesh(GEO.kittenNose, MAT.nosePink);
            nose.position.set(16.5, 11, 0); bg.add(nose);
            const tail = new THREE.Mesh(GEO.kittenTail, bm);
            tail.position.set(-14, 12, 0); tail.rotation.z = Math.PI / 4;
            tail.name = 'tail'; bg.add(tail);
            group.add(bg);
        }

        return group;
    }

    function createDogModel() {
        const group = new THREE.Group();
        group.add(makeHitboxRing(DOG_RADIUS, '#888888'));

        if (wolfTemplate) {
            const model = cloneModel(wolfTemplate);
            model.scale.setScalar(wolfScaleFactor);
            model.name = 'glbModel';

            model.traverse((child) => {
                if (child.isMesh || child.isSkinnedMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            group.add(model);

            // Set up animation mixer with idle + run
            const mixer = new THREE.AnimationMixer(model);
            const runClip = findAnimation(wolfAnimations, 'Run_Forward');
            const idleClip = findAnimation(wolfAnimations, 'Idle01') || findAnimation(wolfAnimations, 'idle');
            const runAction = runClip ? mixer.clipAction(runClip) : null;
            const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
            if (idleAction) idleAction.play();
            group.userData.mixer = mixer;
            group.userData.runAction = runAction;
            group.userData.idleAction = idleAction;
            group.userData.currentAnim = 'idle';
            group.userData.isGLB = true;
        } else {
            // Fallback: procedural dog
            const bg = new THREE.Group(); bg.name = 'bodyGroup';
            const body = new THREE.Mesh(GEO.dogBody, MAT.dogBody);
            body.scale.set(1.1, 0.75, 0.85); body.position.y = 11; bg.add(body);
            const head = new THREE.Mesh(GEO.dogHead, MAT.dogBody);
            head.position.set(14, 14, 0); bg.add(head);
            const snout = new THREE.Mesh(GEO.dogSnout, MAT.dogLight);
            snout.scale.set(1, 0.7, 0.8); snout.position.set(20, 12, 0); bg.add(snout);
            const dNose = new THREE.Mesh(GEO.dogNose, MAT.dogNose);
            dNose.position.set(24, 13, 0); bg.add(dNose);
            [[-8], [8]].forEach(([z]) => {
                const e = new THREE.Mesh(GEO.dogEar, MAT.dogDark);
                e.scale.set(1, 0.5, 0.7); e.position.set(10, 16, z); bg.add(e);
            });
            [[-4], [4]].forEach(([z]) => {
                const e = new THREE.Mesh(GEO.dogEye, MAT.dogEye);
                e.position.set(19, 16, z); bg.add(e);
            });
            const tail = new THREE.Mesh(GEO.dogTail, MAT.dogBody);
            tail.position.set(-16, 14, 0); tail.rotation.z = Math.PI / 3;
            tail.name = 'tail'; bg.add(tail);
            group.add(bg);
        }

        return group;
    }

    function createDeathMarkerModel(color) {
        const group = new THREE.Group();
        const col = new THREE.Color(color);
        const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(GEO.deathRing, ringMat);
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.5; group.add(ring);
        const innerMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false });
        const inner = new THREE.Mesh(GEO.deathInner, innerMat);
        inner.rotation.x = -Math.PI / 2; inner.position.y = 0.4; group.add(inner);
        const pawMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
        const pad = new THREE.Mesh(GEO.paw, pawMat); pad.scale.y = 0.3; pad.position.set(0, 1, 2); group.add(pad);
        [[-4, 1, -3], [4, 1, -3], [0, 1, -6]].forEach(p => {
            const toe = new THREE.Mesh(GEO.pawToe, pawMat); toe.scale.y = 0.3;
            toe.position.set(p[0], p[1], p[2]); group.add(toe);
        });
        group.userData = { ringMat, innerMat };
        return group;
    }

    // ═══════════════════════════════════════════════════════════
    // SCENE BUILDING
    // ═══════════════════════════════════════════════════════════

    function buildMazeScene() {
        mazeZones = generateMazeClient();

        // Void ground (obsidian texture)
        const voidGeo = new THREE.PlaneGeometry(WORLD_WIDTH * 1.5, WORLD_HEIGHT * 1.5);
        MAT.voidGround.map.repeat.set(WORLD_WIDTH * 1.5 / 512 * 2, WORLD_HEIGHT * 1.5 / 512 * 2);
        const voidMesh = new THREE.Mesh(voidGeo, MAT.voidGround);
        voidMesh.rotation.x = -Math.PI / 2;
        voidMesh.position.set(WORLD_WIDTH / 2, -3, WORLD_HEIGHT / 2);
        voidMesh.receiveShadow = true;
        scene.add(voidMesh);

        for (const z of mazeZones) {
            let mat;
            if (z.type === 'safe') mat = MAT.safeGround;
            else if (z.type === 'danger') mat = MAT.dangerGround;
            else if (z.type === 'goal') mat = MAT.goalGround;
            else continue;

            // Clone material so each zone can have its own UV repeat
            const zoneMat = mat.clone();
            if (zoneMat.map) {
                zoneMat.map = zoneMat.map.clone();
                zoneMat.map.needsUpdate = true;
                zoneMat.map.repeat.set(z.w / 128, z.h / 128);
            }

            const topGeo = new THREE.PlaneGeometry(z.w, z.h);
            const topMesh = new THREE.Mesh(topGeo, zoneMat);
            topMesh.rotation.x = -Math.PI / 2;
            topMesh.position.set(z.x + z.w / 2, 0.1, z.y + z.h / 2);
            topMesh.receiveShadow = true;
            scene.add(topMesh);

            if (z.type === 'safe' || z.type === 'goal') {
                const borderGeo = new THREE.PlaneGeometry(z.w + 4, z.h + 4);
                const borderMat = z.type === 'goal'
                    ? new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.12, depthWrite: false })
                    : MAT.zoneBorder;
                const border = new THREE.Mesh(borderGeo, borderMat);
                border.rotation.x = -Math.PI / 2;
                border.position.set(z.x + z.w / 2, 0.05, z.y + z.h / 2);
                scene.add(border);
            }
        }

        const goalZone = mazeZones.find(z => z.type === 'goal');
        if (goalZone) {
            goalLight = new THREE.PointLight(0xffcc44, 0.6, 800);
            goalLight.position.set(goalZone.x + goalZone.w / 2, 60, goalZone.y + goalZone.h / 2);
            scene.add(goalLight);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ENTITY RECONCILIATION + HOP ANIMATION
    // ═══════════════════════════════════════════════════════════

    function isMoving(id, x, y, targetX, targetY) {
        // If target coords provided, use intent-based detection (more reliable)
        if (targetX !== undefined && targetY !== undefined) {
            return Math.abs(x - targetX) > 2 || Math.abs(y - targetY) > 2;
        }
        // Fallback: position-delta detection (for dogs etc.)
        const prev = prevPositions[id];
        if (!prev) return false;
        return Math.abs(x - prev.x) > 0.5 || Math.abs(y - prev.y) > 0.5;
    }

    function reconcileKittens(players) {
        const currentIds = new Set(players.map(p => p.id));
        for (const id of Object.keys(kittenMeshes)) {
            if (!currentIds.has(id)) {
                scene.remove(kittenMeshes[id]);
                delete kittenMeshes[id];
                delete animMixers['kitten_' + id];
            }
        }
        for (const p of players) {
            if (!kittenMeshes[p.id]) {
                kittenMeshes[p.id] = createKittenModel(p.color);
                scene.add(kittenMeshes[p.id]);
                if (kittenMeshes[p.id].userData.mixer) {
                    animMixers['kitten_' + p.id] = kittenMeshes[p.id].userData.mixer;
                }
            }
            const mesh = kittenMeshes[p.id];
            const ud = mesh.userData;

            // Death handling: show cat fallen at death position
            if (!p.alive) {
                mesh.visible = true;
                mesh.position.set(p.deathX || p.x, 0, p.deathY || p.y);
                if (ud.isGLB) {
                    if (ud.currentAnim !== 'death') {
                        if (ud.runAction) ud.runAction.fadeOut(0.15);
                        if (ud.idleAction) ud.idleAction.fadeOut(0.15);
                        if (ud.deathAction) { ud.deathAction.reset().fadeIn(0.15).play(); }
                        ud.currentAnim = 'death';
                    }
                    mesh.scale.set(1, 1, 1);
                } else {
                    const bg = mesh.getObjectByName('bodyGroup');
                    if (bg) { bg.position.y = 0; bg.rotation.z = Math.PI / 2; }
                }
                continue;
            }

            // Reset death state when alive (revived)
            if (ud.currentAnim === 'death') {
                if (ud.deathAction) ud.deathAction.fadeOut(0.15);
                ud.currentAnim = 'none'; // force re-evaluation below
            }

            mesh.position.set(p.x, 0, p.y);
            mesh.visible = true;

            // Smooth visual rotation
            const targetRot = -p.angle + Math.PI / 2;
            if (visualAngles[p.id] === undefined) visualAngles[p.id] = targetRot;
            visualAngles[p.id] = lerpAngle(visualAngles[p.id], targetRot, ROTATION_LERP_SPEED);
            mesh.rotation.y = visualAngles[p.id];

            if (ud.isGLB) {
                const moving = isMoving(p.id, p.x, p.y, p.targetX, p.targetY);

                // Switch between run and idle animations
                if (moving && ud.currentAnim !== 'run') {
                    if (ud.idleAction) ud.idleAction.fadeOut(0.2);
                    if (ud.runAction) { ud.runAction.reset().fadeIn(0.2).play(); }
                    ud.currentAnim = 'run';
                } else if (!moving && ud.currentAnim !== 'idle') {
                    if (ud.runAction) ud.runAction.fadeOut(0.2);
                    if (ud.idleAction) { ud.idleAction.reset().fadeIn(0.2).play(); }
                    ud.currentAnim = 'idle';
                }

                // Invuln pulse
                if (p.invulnTicks > 0) {
                    const s = 1 + Math.sin(frameTick * 0.5) * 0.15;
                    mesh.scale.set(s, s, s);
                } else {
                    mesh.scale.set(1, 1, 1);
                }
            } else {
                // Procedural fallback
                const bg = mesh.getObjectByName('bodyGroup');
                const tail = mesh.getObjectByName('tail');
                const moving = isMoving(p.id, p.x, p.y, p.targetX, p.targetY);
                if (moving) {
                    const hopPhase = Math.abs(Math.sin(frameTick * KITTEN_HOP_SPEED));
                    if (bg) { bg.position.y = hopPhase * KITTEN_HOP_HEIGHT; bg.rotation.z = Math.sin(frameTick * KITTEN_HOP_SPEED) * 0.08; }
                    if (tail) { tail.rotation.x = Math.sin(frameTick * 0.3) * 0.6; tail.rotation.z = Math.PI / 4 + Math.sin(frameTick * KITTEN_HOP_SPEED * 2) * 0.15; }
                } else {
                    if (bg) { bg.position.y = 0; bg.rotation.z = 0; }
                    if (tail) { tail.rotation.x = Math.sin(frameTick * 0.1) * 0.3; tail.rotation.z = Math.PI / 4; }
                }
                if (p.invulnTicks > 0) {
                    const s = 1 + Math.sin(frameTick * 0.5) * 0.15;
                    mesh.scale.set(s, s, s);
                } else { mesh.scale.set(1, 1, 1); }
            }
        }
    }

    function reconcileDogs(dogs) {
        if (!dogs) return;
        const currentIds = new Set(dogs.map(d => d.id));
        for (const id of Object.keys(dogMeshes)) {
            if (!currentIds.has(parseInt(id))) {
                scene.remove(dogMeshes[id]);
                delete dogMeshes[id];
                delete animMixers['dog_' + id];
            }
        }
        for (const d of dogs) {
            if (!dogMeshes[d.id]) {
                dogMeshes[d.id] = createDogModel();
                scene.add(dogMeshes[d.id]);
                if (dogMeshes[d.id].userData.mixer) {
                    animMixers['dog_' + d.id] = dogMeshes[d.id].userData.mixer;
                }
            }
            const mesh = dogMeshes[d.id];
            mesh.position.set(d.x, 0, d.y);

            // Smooth visual rotation
            const dogKey = 'dog_' + d.id;
            const targetRot = -d.angle + Math.PI / 2;
            if (visualAngles[dogKey] === undefined) visualAngles[dogKey] = targetRot;
            visualAngles[dogKey] = lerpAngle(visualAngles[dogKey], targetRot, ROTATION_LERP_SPEED);
            mesh.rotation.y = visualAngles[dogKey];

            if (mesh.userData.isGLB) {
                const ud = mesh.userData;
                const shouldRun = d.s === 1; // Use server state directly

                if (shouldRun && ud.currentAnim !== 'run') {
                    if (ud.idleAction) ud.idleAction.fadeOut(0.2);
                    if (ud.runAction) { ud.runAction.reset().fadeIn(0.2).play(); }
                    ud.currentAnim = 'run';
                } else if (!shouldRun && ud.currentAnim !== 'idle') {
                    if (ud.runAction) ud.runAction.fadeOut(0.2);
                    if (ud.idleAction) { ud.idleAction.reset().fadeIn(0.2).play(); }
                    ud.currentAnim = 'idle';
                }
            } else {
                // Procedural fallback
                const bg = mesh.getObjectByName('bodyGroup');
                const tail = mesh.getObjectByName('tail');
                const shouldRun = d.s === 1;
                if (shouldRun) {
                    const hopPhase = Math.abs(Math.sin(frameTick * DOG_HOP_SPEED + d.id * 0.7));
                    if (bg) { bg.position.y = hopPhase * DOG_HOP_HEIGHT; bg.rotation.z = Math.sin(frameTick * DOG_HOP_SPEED + d.id * 0.7) * 0.06; }
                    if (tail) { tail.rotation.x = Math.sin(frameTick * 0.25 + d.id * 3) * 0.5; }
                } else {
                    if (bg) { bg.position.y = Math.sin(frameTick * 0.08 + d.id) * 1.5; bg.rotation.z = 0; }
                    if (tail) { tail.rotation.x = Math.sin(frameTick * 0.1 + d.id * 3) * 0.4; }
                }
            }
        }
    }

    function reconcileDeathMarkers(players) {
        const deadPlayers = players.filter(p => !p.alive && p.deathX !== null);
        const deadIds = new Set(deadPlayers.map(p => p.id));
        for (const id of Object.keys(deathMarkers)) {
            if (!deadIds.has(id)) { scene.remove(deathMarkers[id]); delete deathMarkers[id]; }
        }
        for (const p of deadPlayers) {
            if (!deathMarkers[p.id]) { deathMarkers[p.id] = createDeathMarkerModel(p.color); scene.add(deathMarkers[p.id]); }
            const mesh = deathMarkers[p.id];
            mesh.position.set(p.deathX, 0.3, p.deathY);
            const pulse = 0.85 + Math.sin(frameTick * 0.05) * 0.15;
            mesh.scale.set(pulse, 1, pulse);
            const ud = mesh.userData;
            if (ud.ringMat) ud.ringMat.opacity = 0.35 + Math.sin(frameTick * 0.05) * 0.15;
            if (ud.innerMat) ud.innerMat.opacity = 0.15 + Math.sin(frameTick * 0.05) * 0.1;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // NAME LABELS (overlay canvas)
    // ═══════════════════════════════════════════════════════════

    function drawNameLabels(gameState) {
        const overlay = window.PDROP.getOverlayCanvas();
        if (!overlay) return;
        const oc = overlay.getContext('2d');
        if (!oc || !gameState) return;
        const vec = new THREE.Vector3();
        for (const p of gameState.players) {
            if (!p.alive) continue;
            vec.set(p.x, 25, p.y); vec.project(camera3d);
            const sx = (vec.x * 0.5 + 0.5) * 1920;
            const sy = (-vec.y * 0.5 + 0.5) * 1080;
            if (sx < -100 || sx > 2020 || sy < -100 || sy > 1180) continue;
            oc.font = '600 20px Rajdhani';
            oc.textAlign = 'center'; oc.textBaseline = 'bottom';
            oc.fillStyle = 'rgba(0,0,0,0.6)'; oc.fillText(p.name, sx + 1, sy + 1);
            oc.fillStyle = '#ffffff'; oc.fillText(p.name, sx, sy);
            if (p.reachedGoal) {
                oc.fillStyle = '#f0c040'; oc.font = '700 16px Rajdhani';
                oc.fillText('\u2605 SAFE', sx, sy - 18);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HUD
    // ═══════════════════════════════════════════════════════════

    function updateStatusBar(gameState) {
        const el = document.getElementById('status-bar');
        if (!el || !gameState || !gameState.players) return;
        const lobby = window.PDROP.getCurrentLobby();
        const isTeams = lobby && lobby.mode === 'teams';
        const running = gameState.players.filter(p => p.alive && !p.reachedGoal).length;
        const caught = gameState.players.filter(p => !p.alive).length;
        const finished = gameState.players.filter(p => p.reachedGoal).length;
        if (isTeams) {
            const td = {};
            const TC = window.PDROP.COLORS, TN = window.PDROP.COLOR_NAMES;
            for (const p of gameState.players) {
                if (!td[p.team]) td[p.team] = { r: 0, c: 0, f: 0 };
                if (p.reachedGoal) td[p.team].f++; else if (!p.alive) td[p.team].c++; else td[p.team].r++;
            }
            let html = '';
            for (const t of Object.keys(td).sort()) {
                const d = td[t]; if (html) html += '&nbsp;&nbsp;|&nbsp;&nbsp;';
                html += `<span style="color:${TC[t]}">${TN[t]}</span>: ${d.r}`;
                if (d.c > 0) html += ` \u00B7 ${d.c}\u2620`;
                if (d.f > 0) html += ` \u00B7 ${d.f}\u2605`;
            }
            el.innerHTML = html;
        } else {
            let parts = [];
            if (running > 0) parts.push(`${running} running`);
            if (caught > 0) parts.push(`${caught} caught`);
            if (finished > 0) parts.push(`${finished} finished`);
            el.textContent = parts.join(' \u00B7 ');
        }
    }

    function updatePersonalStatus(gameState) {
        const el = document.getElementById('personal-status');
        if (!el || !gameState) return;
        const lp = gameState.players?.find(p => p.id === window.PDROP.getLocalPlayerId());
        if (!lp) { el.textContent = ''; return; }
        if (!lp.alive) { el.textContent = '\u2620 You were caught! Waiting for revival...'; el.style.color = lp.color; }
        else if (lp.reachedGoal) { el.textContent = '\u2605 You made it! Cheering on teammates...'; el.style.color = '#f0c040'; }
        else { el.textContent = ''; }
    }

    function esc(str) { return window.PDROP.escapeHtml(str); }

    // ═══════════════════════════════════════════════════════════
    // GAMEDEF
    // ═══════════════════════════════════════════════════════════

    window.GameDef = {
        renderer: '3d',
        id: 'rkr',
        name: 'Run Kitty Run!',
        maxPlayers: 12,
        supportedModes: ['ffa', 'teams'],
        defaultMode: 'ffa',
        defaultTeamCount: 2,
        worldWidth: WORLD_WIDTH,
        worldHeight: WORLD_HEIGHT,

        preload() {
            return Promise.all([loadGLBModels(), loadGroundTextures()]);
        },

        getCameraLockTarget(lp) {
            if (lp && lp.alive && !lp.reachedGoal) return { x: lp.x, y: lp.y };
            return null;
        },
        getCameraSnapTarget(lp) {
            if (lp && lp.alive && !lp.reachedGoal) return { x: lp.x, y: lp.y };
            return null;
        },

        initRenderer(canvasEl) {
            if (rendererReady) return;
            renderer3d = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
            renderer3d.setSize(1920, 1080, false);
            renderer3d.setClearColor(0x060610);
            renderer3d.setPixelRatio(1);
            renderer3d.shadowMap.enabled = true;
            renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;
            scene = new THREE.Scene();
            scene.fog = new THREE.FogExp2(0x060610, 0.00015);
            camera3d = new THREE.PerspectiveCamera(CAM_FOV, 1920 / 1080, 10, 8000);
            ambientLight = new THREE.AmbientLight(0xccccdd, 0.45); scene.add(ambientLight);
            dirLight = new THREE.DirectionalLight(0xfff5e0, 0.7);
            dirLight.position.set(-1500, 2000, -1000);
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.width = 2048;
            dirLight.shadow.mapSize.height = 2048;
            dirLight.shadow.camera.near = 100;
            dirLight.shadow.camera.far = 5000;
            dirLight.shadow.camera.left = -2500;
            dirLight.shadow.camera.right = 2500;
            dirLight.shadow.camera.top = 2500;
            dirLight.shadow.camera.bottom = -2500;
            scene.add(dirLight);
            const fillLight = new THREE.DirectionalLight(0xaabbdd, 0.25);
            fillLight.position.set(1000, 800, 2000); scene.add(fillLight);
            initSharedAssets();
            buildMazeScene();
            rendererReady = true;
            SFX.init();
        },

        onGameStart(initialState) {
            mazeZones = generateMazeClient();
            const ef = document.getElementById('event-feed'); if (ef) ef.innerHTML = '';
            const ps = document.getElementById('personal-status'); if (ps) ps.textContent = '';
            for (const id of Object.keys(kittenMeshes)) { scene.remove(kittenMeshes[id]); } kittenMeshes = {};
            for (const id of Object.keys(dogMeshes)) { scene.remove(dogMeshes[id]); } dogMeshes = {};
            for (const id of Object.keys(deathMarkers)) { scene.remove(deathMarkers[id]); } deathMarkers = {};
            animMixers = {};
            prevPositions = {};
        },

        onElimination(msg) {
            const ef = document.getElementById('event-feed'); if (!ef) return;
            let text = '';
            if (msg.type === 'kitten_revived') {
                text = `<span style="color:${msg.reviverColor}">${esc(msg.reviverName)}</span> revived <span style="color:${msg.playerColor}">${esc(msg.playerName)}</span>!`;
                SFX.play('revived');
            } else if (msg.type === 'kitten_reached_goal') {
                text = `<span style="color:${msg.playerColor}">${esc(msg.playerName)}</span> reached the goal! \u2605`;
                SFX.play('goal');
            } else {
                text = `<span style="color:${msg.playerColor}">${esc(msg.playerName)}</span> was caught!`;
                SFX.play('caught');
            }
            const entry = document.createElement('div'); entry.className = 'event-entry'; entry.innerHTML = text;
            ef.appendChild(entry);
            setTimeout(() => { entry.style.opacity = '0'; setTimeout(() => entry.remove(), 1000); }, 5000);
        },

        render(fwCamera, gameState) {
            if (!rendererReady || !renderer3d) return;
            frameTick++;

            // Update animation mixers
            const now = performance.now() / 1000;
            const delta = lastTime ? Math.min(now - lastTime, 0.1) : 0.016;
            lastTime = now;
            for (const id in animMixers) {
                animMixers[id].update(delta);
            }

            // Continuously move toward cursor while right mouse held
            if (rightMouseHeld) {
                const lp = window.PDROP.getLocalPlayerFromState();
                if (lp && lp.alive) {
                    const cam = window.PDROP.camera;
                    const worldX = mouseCanvasX / cam.zoom + cam.x;
                    const worldY = mouseCanvasY / cam.zoom + cam.y;
                    window.PDROP.wsSend({ type: 'game_input', data: { type: 'move', x: worldX, y: worldY } });
                }
            }

            if (gameState) {
                reconcileKittens(gameState.players || []);
                // Store kitten positions AFTER reconcile so isMoving works next frame
                for (const p of (gameState.players || [])) {
                    if (p.alive) prevPositions[p.id] = { x: p.x, y: p.y };
                }
                reconcileDogs(gameState.dogs);
                reconcileDeathMarkers(gameState.players || []);
                updateStatusBar(gameState);
                updatePersonalStatus(gameState);
            }

            if (goalLight) {
                goalPulse += 0.03;
                goalLight.intensity = 0.4 + Math.sin(goalPulse) * 0.25;
                goalLight.position.y = 60 + Math.sin(goalPulse * 0.7) * 15;
            }

            const zoom = fwCamera.zoom || 1;
            const vw = 1920 / zoom, vh = 1080 / zoom;
            const centerX = fwCamera.x + vw / 2, centerZ = fwCamera.y + vh / 2;
            const height = CAM_BASE_HEIGHT / zoom;
            camera3d.position.set(centerX, height, centerZ + height * CAM_TILT_FACTOR);
            camera3d.lookAt(centerX, 0, centerZ);

            renderer3d.render(scene, camera3d);
            if (gameState) drawNameLabels(gameState);
        },

        onInput(inputType, data) {
            if (inputType === 'rightclick' || inputType === 'rightmousedown') {
                const lp = window.PDROP.getLocalPlayerFromState();
                if (lp && !lp.alive) return;
                window.PDROP.wsSend({ type: 'game_input', data: { type: 'move', x: data.x, y: data.y } });
                if (inputType === 'rightmousedown') rightMouseHeld = true;
            } else if (inputType === 'rightmouseup') {
                rightMouseHeld = false;
            } else if (inputType === 'keydown' && data.key === 's') {
                rightMouseHeld = false;
                window.PDROP.wsSend({ type: 'game_input', data: { type: 'stop' } });
            }
        },

        getScoreboardColumns() { return [{ key: 'status', label: 'Status', width: 100 }]; },
        getPlayerStats(playerId) {
            const gs = window.PDROP.getGameState(); if (!gs || !gs.players) return { status: '' };
            const p = gs.players.find(pl => pl.id === playerId); if (!p) return { status: '' };
            if (p.reachedGoal) return { status: '\u2605 Finished' };
            if (!p.alive) return { status: '\u2620 Caught' };
            return { status: 'Running' };
        },
        getEntityTooltip(entity) {
            if (entity.type === 'player') {
                const status = entity.reachedGoal ? 'Reached the goal!' : entity.alive ? 'Running' : 'Caught!';
                return `<div class="tip-title" style="color: ${entity.color}">${esc(entity.name)}</div><div class="tip-desc">${status}</div>`;
            }
            return null;
        },
        getResults(finalState) { return finalState; },
    };
})();
