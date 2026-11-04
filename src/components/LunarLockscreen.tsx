import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Volume2, VolumeX, Maximize2, Minimize2, ArrowDownCircle, ArrowUpCircle, Play, Pause, LogIn, Lock, Compass, Eye, EyeOff } from 'lucide-react';

// Photorealistic celestial textures generated for HD 8k-feel low file size rendering
import darkVoidImg from '../assets/images/lunar_dark_void_1792948616075.jpg';
import earthHdImg from '../assets/images/realistic_earth_hd_1792948713053.jpg';
import moonSurfaceImg from '../assets/images/realistic_moon_surface_1792948725759.jpg';
import lunarPanoramaImg from '../assets/images/lunar_surface_hd_360_1792948738973.jpg';

interface LunarLockscreenProps {
  isLockscreenActive: boolean;
  onToggleLockscreen: (active: boolean) => void;
  radioTrack?: { title?: string; artist?: string } | null;
  isRadioPlaying?: boolean;
  onToggleRadio?: () => void;
  radioVolume?: number;
  onChangeRadioVolume?: (vol: number) => void;
  children?: React.ReactNode;
}

// Procedural fallback texture generators for Moon and Earth
function generateMoonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#53565c');
    grad.addColorStop(0.5, '#686b73');
    grad.addColorStop(1, '#4e5158');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const maria = [
      { x: 380, y: 210, rx: 110, ry: 75, color: 'rgba(38, 41, 46, 0.72)' },
      { x: 520, y: 190, rx: 130, ry: 90, color: 'rgba(34, 37, 42, 0.78)' },
      { x: 310, y: 280, rx: 80, ry: 60, color: 'rgba(40, 43, 49, 0.65)' },
      { x: 670, y: 230, rx: 95, ry: 70, color: 'rgba(36, 39, 44, 0.70)' },
      { x: 460, y: 310, rx: 70, ry: 50, color: 'rgba(42, 45, 50, 0.60)' },
      { x: 230, y: 190, rx: 90, ry: 65, color: 'rgba(35, 38, 43, 0.68)' }
    ];

    maria.forEach(m => {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.rx, m.ry, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      try {
        ctx.filter = 'blur(12px)';
      } catch (_) {}
      ctx.fill();
      ctx.restore();
    });

    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 26;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (_) {}
  } catch (err) {
    console.warn('Moon procedural texture fallback:', err);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function generateMoonBumpMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let k = 0; k < 180; k++) {
      const cx = Math.random() * canvas.width;
      const cy = Math.random() * canvas.height;
      const r = 3 + Math.random() * 16;

      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#b8b8b8';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#404040';
      ctx.fill();
    }
  } catch (err) {
    console.warn('Moon bump map fallback:', err);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function generateEarthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#0b1d3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1e4822';
    const continents = [
      { x: 480, y: 190, rx: 75, ry: 90 }, // Africa
      { x: 470, y: 100, rx: 65, ry: 45 }, // Europe
      { x: 620, y: 120, rx: 110, ry: 70 }, // Asia
      { x: 260, y: 110, rx: 80, ry: 50 }, // North America
      { x: 310, y: 260, rx: 60, ry: 85 }, // South America
      { x: 740, y: 280, rx: 55, ry: 45 }  // Australia
    ];

    continents.forEach(c => {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx, c.ry, 0.15, 0, Math.PI * 2);
      try {
        ctx.filter = 'blur(6px)';
      } catch (_) {}
      ctx.fill();
      ctx.restore();
    });
  } catch (err) {
    console.warn('Earth procedural texture fallback:', err);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function generateEarthCloudsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';

    for (let i = 0; i < 90; i++) {
      const cx = Math.random() * canvas.width;
      const cy = 60 + Math.random() * (canvas.height - 120);
      const rw = 25 + Math.random() * 85;
      const rh = 10 + Math.random() * 30;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, Math.random() * 0.4, 0, Math.PI * 2);
      try {
        ctx.filter = 'blur(8px)';
      } catch (_) {}
      ctx.fill();
      ctx.restore();
    }
  } catch (err) {
    console.warn('Earth clouds procedural texture fallback:', err);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export const LunarLockscreen: React.FC<LunarLockscreenProps> = ({
  isLockscreenActive,
  onToggleLockscreen,
  radioTrack,
  isRadioPlaying = false,
  onToggleRadio,
  radioVolume = 0.8,
  onChangeRadioVolume,
  children
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isImmersed, setIsImmersed] = useState(false);
  const [immersionRatio, setImmersionRatio] = useState(0); // 0 = orbit, 1 = surface
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [utcTime, setUtcTime] = useState('');
  const [fps, setFps] = useState(60);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(true);
  const [isHDLoaded, setIsHDLoaded] = useState(false);

  // References for Three.js state
  const targetImmersionRef = useRef(0);
  const currentImmersionRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  // 360-degree surface panoramic rotation references
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const yawRef = useRef(0); // horizontal radians
  const pitchRef = useRef(0.25); // vertical radians
  const targetYawRef = useRef(0);
  const targetPitchRef = useRef(0.25);

  // Three.js internal objects
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerVecRef = useRef(new THREE.Vector2());
  const moonMeshRef = useRef<THREE.Mesh | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Web Audio synth for ambient space hum
  const audioContextRef = useRef<AudioContext | null>(null);

  // Live UTC Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, '0');
      const m = String(now.getUTCMinutes()).padStart(2, '0');
      const s = String(now.getUTCSeconds()).padStart(2, '0');
      const ms = String(Math.floor(now.getUTCMilliseconds() / 10)).padStart(2, '0');
      setUtcTime(`${h}:${m}:${s}.${ms}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 50);
    return () => clearInterval(timer);
  }, []);

  // Web Audio synth toggle
  const toggleAmbientSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx();

        const osc1 = audioContextRef.current.createOscillator();
        const osc2 = audioContextRef.current.createOscillator();
        const filter = audioContextRef.current.createBiquadFilter();
        const gain = audioContextRef.current.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(55, audioContextRef.current.currentTime);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(110, audioContextRef.current.currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, audioContextRef.current.currentTime);
        gain.gain.setValueAtTime(0.035, audioContextRef.current.currentTime);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(audioContextRef.current.destination);

        osc1.start();
        osc2.start();
        setIsAudioActive(true);
      } else {
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
          setIsAudioActive(true);
        } else if (audioContextRef.current.state === 'running') {
          audioContextRef.current.suspend();
          setIsAudioActive(false);
        }
      }
    } catch (e) {
      console.warn('Audio unlock warning:', e);
    }
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleToggleImmersion = useCallback(() => {
    const next = !isImmersed;
    setIsImmersed(next);
    targetImmersionRef.current = next ? 1 : 0;
  }, [isImmersed]);

  // Main Three.js Scene Setup & Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let animationFrameId: number;
    let frameCount = 0;
    let fpsTimer = performance.now();

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0028);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 2000);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false
      });
    } catch (e) {
      console.warn("WebGL initialization note:", e);
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);

    const textureLoader = new THREE.TextureLoader();

    // ==========================================
    // 1. PHOTOREALISTIC DARK VOID SKYDOME
    // ==========================================
    const skyDomeGeo = new THREE.SphereGeometry(950, 48, 32);
    skyDomeGeo.scale(-1, 1, 1);
    const skyDomeMat = new THREE.MeshBasicMaterial({
      color: 0x111115,
      depthWrite: false
    });
    const skyDomeMesh = new THREE.Mesh(skyDomeGeo, skyDomeMat);
    scene.add(skyDomeMesh);

    textureLoader.load(
      darkVoidImg, 
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        skyDomeMat.map = tex;
        skyDomeMat.color.setHex(0xffffff);
        skyDomeMat.needsUpdate = true;
        setIsHDLoaded(true);
      },
      undefined,
      (err) => console.warn('Sky dome texture load note:', err)
    );

    // Cosmic Pinpoint Starfield Layer
    const starCount = 3600;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const radius = 340 + Math.random() * 520;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      starPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = radius * Math.cos(phi);

      const tint = Math.random();
      if (tint > 0.88) {
        starColors[i * 3] = 0.75; starColors[i * 3 + 1] = 0.88; starColors[i * 3 + 2] = 1.0;
      } else if (tint > 0.72) {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.92; starColors[i * 3 + 2] = 0.8;
      } else {
        starColors[i * 3] = 0.96; starColors[i * 3 + 1] = 0.96; starColors[i * 3 + 2] = 0.98;
      }
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    });
    const starfield = new THREE.Points(starGeo, starMat);
    scene.add(starfield);

    // ==========================================
    // 2. EARTH SPHERE (Cosmic Marble with HD Texture)
    // ==========================================
    const earthGroup = new THREE.Group();
    earthGroup.position.set(16, 15, -42);
    scene.add(earthGroup);

    const earthTexture = generateEarthTexture();
    const earthGeo = new THREE.SphereGeometry(4.8, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.55,
      metalness: 0.08
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    textureLoader.load(
      earthHdImg, 
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        earthMat.map = tex;
        earthMat.needsUpdate = true;
      },
      undefined,
      (err) => console.warn('Earth texture load note:', err)
    );

    // Earth Clouds
    const cloudsTexture = generateEarthCloudsTexture();
    const cloudsGeo = new THREE.SphereGeometry(4.88, 64, 64);
    const cloudsMat = new THREE.MeshStandardMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.55,
      blending: THREE.NormalBlending
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    earthGroup.add(cloudsMesh);

    // Earth Atmospheric Glow Limb
    const atmosphereGeo = new THREE.SphereGeometry(5.12, 32, 32);
    const atmosphereMat = new THREE.MeshBasicMaterial({
      color: 0x3fa2ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    earthGroup.add(atmosphereMesh);

    // ==========================================
    // 3. ORBITAL MOON SPHERE (Realistic Texture)
    // ==========================================
    const orbitalMoonGroup = new THREE.Group();
    scene.add(orbitalMoonGroup);

    const moonTexture = generateMoonTexture();
    const moonBumpMap = generateMoonBumpMap();

    const moonOrbitalGeo = new THREE.SphereGeometry(9.2, 64, 64);
    const moonOrbitalMat = new THREE.MeshStandardMaterial({
      map: moonTexture,
      bumpMap: moonBumpMap,
      bumpScale: 0.25,
      roughness: 0.94,
      metalness: 0.04
    });
    const moonOrbitalMesh = new THREE.Mesh(moonOrbitalGeo, moonOrbitalMat);
    moonOrbitalMesh.position.set(0, 0, 0);
    orbitalMoonGroup.add(moonOrbitalMesh);
    moonMeshRef.current = moonOrbitalMesh;

    textureLoader.load(
      moonSurfaceImg, 
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        moonOrbitalMat.map = tex;
        moonOrbitalMat.bumpMap = tex;
        moonOrbitalMat.bumpScale = 0.4;
        moonOrbitalMat.needsUpdate = true;
      },
      undefined,
      (err) => console.warn('Moon surface texture load note:', err)
    );

    // ==========================================
    // 4. IMMERSIVE LUNAR 360 SURFACE PANORAMA
    // ==========================================
    const surfaceGroup = new THREE.Group();
    surfaceGroup.position.set(0, -1.2, -12);
    scene.add(surfaceGroup);

    // 360 Panoramic Lunar Horizon & Earthrise Dome
    const panoramaDomeGeo = new THREE.SphereGeometry(320, 48, 32);
    panoramaDomeGeo.scale(-1, 1, 1);
    const panoramaDomeMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const panoramaDomeMesh = new THREE.Mesh(panoramaDomeGeo, panoramaDomeMat);
    panoramaDomeMesh.position.set(0, 0, 0);
    panoramaDomeMesh.rotation.y = -Math.PI / 3.5;
    surfaceGroup.add(panoramaDomeMesh);

    textureLoader.load(
      lunarPanoramaImg, 
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        panoramaDomeMat.map = tex;
        panoramaDomeMat.needsUpdate = true;
      },
      undefined,
      (err) => console.warn('Panorama texture load note:', err)
    );

    // Displaced Lunar Regolith Terrain Plane
    const terrainWidth = 160;
    const terrainHeight = 160;
    const terrainSegments = 130;
    const terrainGeo = new THREE.PlaneGeometry(terrainWidth, terrainHeight, terrainSegments, terrainSegments);
    terrainGeo.rotateX(-Math.PI / 2);

    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);

      let elevation = Math.sin(vx * 0.06) * Math.cos(vz * 0.06) * 2.2;
      elevation += Math.sin(vx * 0.15 + 1.2) * Math.sin(vz * 0.14) * 0.9;
      elevation += Math.sin(vx * 0.35) * Math.cos(vz * 0.35) * 0.35;

      // Crater basin 1
      const dist1 = Math.hypot(vx - 2, vz + 15);
      if (dist1 < 22) {
        elevation -= Math.cos((dist1 / 22) * Math.PI * 0.5) * 3.4;
        if (dist1 > 17 && dist1 < 22) {
          elevation += Math.sin(((dist1 - 17) / 5) * Math.PI) * 1.6;
        }
      }

      // Crater basin 2
      const dist2 = Math.hypot(vx - 16, vz + 4);
      if (dist2 < 14) {
        elevation -= Math.cos((dist2 / 14) * Math.PI * 0.5) * 2.1;
        if (dist2 > 10 && dist2 < 14) {
          elevation += Math.sin(((dist2 - 10) / 4) * Math.PI) * 1.1;
        }
      }

      elevation += (Math.random() - 0.5) * 0.08;
      pos.setY(i, elevation);
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      map: moonTexture,
      bumpMap: moonBumpMap,
      bumpScale: 0.35,
      roughness: 0.96,
      metalness: 0.03
    });
    if (terrainMat.map) {
      terrainMat.map.wrapS = THREE.RepeatWrapping;
      terrainMat.map.wrapT = THREE.RepeatWrapping;
      terrainMat.map.repeat.set(6, 6);
    }
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    surfaceGroup.add(terrainMesh);

    // Scattered 3D Boulders
    const boulderCount = 150;
    const boulderGeo = new THREE.DodecahedronGeometry(0.35, 1);
    const bPos = boulderGeo.attributes.position;
    for (let b = 0; b < bPos.count; b++) {
      const rx = bPos.getX(b) * (0.85 + Math.random() * 0.3);
      const ry = bPos.getY(b) * (0.75 + Math.random() * 0.4);
      const rz = bPos.getZ(b) * (0.85 + Math.random() * 0.3);
      bPos.setXYZ(b, rx, ry, rz);
    }
    boulderGeo.computeVertexNormals();

    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0x6e7178,
      roughness: 0.98,
      metalness: 0.02
    });
    const boulderInstanced = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderCount);

    const dummy = new THREE.Object3D();
    for (let b = 0; b < boulderCount; b++) {
      const bx = (Math.random() - 0.5) * 55;
      const bz = 10 - Math.random() * 55;

      let by = Math.sin(bx * 0.06) * Math.cos(bz * 0.06) * 2.2;
      by += Math.sin(bx * 0.15 + 1.2) * Math.sin(bz * 0.14) * 0.9;
      by += 0.1;

      dummy.position.set(bx, by, bz);
      const scale = 0.2 + Math.random() * 0.85;
      dummy.scale.set(scale, scale * (0.7 + Math.random() * 0.5), scale);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.updateMatrix();
      boulderInstanced.setMatrixAt(b, dummy.matrix);
    }
    boulderInstanced.instanceMatrix.needsUpdate = true;
    surfaceGroup.add(boulderInstanced);

    // Floating Low-Gravity Dust Particles
    const dustCount = 450;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    for (let d = 0; d < dustCount; d++) {
      dustPositions[d * 3] = (Math.random() - 0.5) * 45;
      dustPositions[d * 3 + 1] = 0.2 + Math.random() * 4.5;
      dustPositions[d * 3 + 2] = 8 - Math.random() * 45;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.8,
      color: 0xddeeff,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    surfaceGroup.add(dustPoints);

    // ==========================================
    // 5. LIGHTING
    // ==========================================
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.9);
    sunLight.position.set(38, 25, 20);
    scene.add(sunLight);

    const earthshineLight = new THREE.AmbientLight(0x1a2638, 0.2);
    scene.add(earthshineLight);

    // Camera keyframe anchors
    const orbitCamPos = new THREE.Vector3(0, 7.5, 30);
    const orbitCamLook = new THREE.Vector3(0, 0, 0);

    const surfaceCamPos = new THREE.Vector3(0, 1.45, 5.2);

    const currentCamPos = new THREE.Vector3().copy(orbitCamPos);
    const currentCamLook = new THREE.Vector3().copy(orbitCamLook);

    // Pointer events: Raycasting to tap Moon & 360-degree landscape pan
    const handlePointerDown = (clientX: number, clientY: number) => {
      isDraggingRef.current = true;
      dragStartRef.current = { x: clientX, y: clientY };

      // Raycast to check if user tapped the Moon in Orbit mode
      if (currentImmersionRef.current < 0.3 && moonMeshRef.current && cameraRef.current) {
        pointerVecRef.current.x = (clientX / window.innerWidth) * 2 - 1;
        pointerVecRef.current.y = -(clientY / window.innerHeight) * 2 + 1;
        raycasterRef.current.setFromCamera(pointerVecRef.current, cameraRef.current);
        const intersects = raycasterRef.current.intersectObject(moonMeshRef.current);
        if (intersects.length > 0) {
          handleToggleImmersion();
        }
      }
    };

    const handlePointerMove = (clientX: number, clientY: number) => {
      // Mouse drift parallax in Orbit
      const nx = (clientX / window.innerWidth) * 2 - 1;
      const ny = -(clientY / window.innerHeight) * 2 + 1;
      mouseRef.current.targetX = nx * 1.5;
      mouseRef.current.targetY = ny * 1.0;

      // 360 Drag when in Surface Immersion mode
      if (isDraggingRef.current && currentImmersionRef.current > 0.35) {
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        dragStartRef.current = { x: clientX, y: clientY };

        targetYawRef.current -= dx * 0.0055;
        targetPitchRef.current = Math.max(-0.35, Math.min(1.2, targetPitchRef.current + dy * 0.0045));
      }
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    // Event Listeners
    const onMouseDown = (e: MouseEvent) => {
      // Ignore if clicking on input, button, select, or card form
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select, textarea, a, .form-card-container')) {
        return;
      }
      handlePointerDown(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
    const onMouseUp = () => handlePointerUp();

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select, textarea, a, .form-card-container')) {
        return;
      }
      if (e.touches.length > 0) {
        handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => handlePointerUp();

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const nw = container.clientWidth || window.innerWidth;
      const nh = container.clientHeight || window.innerHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    const animate = (now: number) => {
      animationFrameId = requestAnimationFrame(animate);

      // FPS Calculation
      frameCount++;
      if (now - fpsTimer >= 500) {
        setFps(Math.round((frameCount * 1000) / (now - fpsTimer)));
        frameCount = 0;
        fpsTimer = now;
      }

      // Smooth Immersion Lerp
      const targetRatio = targetImmersionRef.current;
      currentImmersionRef.current = THREE.MathUtils.lerp(currentImmersionRef.current, targetRatio, 0.038);
      const ratio = currentImmersionRef.current;
      setImmersionRatio(ratio);

      // Smooth Mouse Drift
      mouseRef.current.x = THREE.MathUtils.lerp(mouseRef.current.x, mouseRef.current.targetX, 0.05);
      mouseRef.current.y = THREE.MathUtils.lerp(mouseRef.current.y, mouseRef.current.targetY, 0.05);

      // Smooth 360 Yaw/Pitch
      yawRef.current = THREE.MathUtils.lerp(yawRef.current, targetYawRef.current, 0.08);
      pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, targetPitchRef.current, 0.08);

      // Interpolate Camera Position
      currentCamPos.lerpVectors(orbitCamPos, surfaceCamPos, ratio);

      camera.position.x = currentCamPos.x + mouseRef.current.x * (1 - ratio * 0.7);
      camera.position.y = currentCamPos.y + mouseRef.current.y * (1 - ratio * 0.7);
      camera.position.z = currentCamPos.z;

      // Compute dynamic look target
      const orbitLook = new THREE.Vector3(
        orbitCamLook.x + mouseRef.current.x * 1.2,
        orbitCamLook.y + mouseRef.current.y * 0.8,
        orbitCamLook.z
      );

      const lookRadius = 50;
      const surface360Look = new THREE.Vector3(
        camera.position.x + Math.sin(yawRef.current) * Math.cos(pitchRef.current) * lookRadius,
        camera.position.y + Math.sin(pitchRef.current) * lookRadius,
        camera.position.z - Math.cos(yawRef.current) * Math.cos(pitchRef.current) * lookRadius
      );

      currentCamLook.lerpVectors(orbitLook, surface360Look, ratio);
      camera.lookAt(currentCamLook);

      // Rotations
      earthMesh.rotation.y += 0.0004;
      cloudsMesh.rotation.y += 0.0006;
      moonOrbitalMesh.rotation.y += 0.0002;
      skyDomeMesh.rotation.y += 0.00005;

      // Fade orbital moon mesh as camera immerses into surface
      if (moonOrbitalMat) {
        moonOrbitalMat.opacity = Math.max(0, 1 - ratio * 1.6);
        moonOrbitalMat.transparent = ratio > 0.05;
      }

      // Fade in 360 surface panorama as we descend
      if (panoramaDomeMat) {
        panoramaDomeMat.opacity = THREE.MathUtils.clamp((ratio - 0.2) / 0.8, 0, 1);
      }

      // Low-gravity dust float
      const dustPosAttr = dustGeo.attributes.position as THREE.BufferAttribute;
      if (dustPosAttr) {
        const arr = dustPosAttr.array as Float32Array;
        for (let d = 0; d < dustCount; d++) {
          arr[d * 3 + 1] += Math.sin(now * 0.001 + d) * 0.002;
        }
        dustPosAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('resize', handleResize);

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      if (renderer) {
        if (container && renderer.domElement && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
    };
  }, [handleToggleImmersion]);

  // Formatted Altitude calculation
  const altitudeKm = Math.round((1 - immersionRatio) * 384400 + immersionRatio * 0.0017);
  const formattedAltitude = immersionRatio > 0.98 ? '1.7 M (SURFACE)' : `${altitudeKm.toLocaleString()} KM`;

  return (
    <div className="fixed inset-0 w-full h-full bg-black overflow-hidden select-none font-mono text-white touch-manipulation">
      {/* 3D WebGL Canvas Layer */}
      <div 
        ref={mountRef} 
        className={`absolute inset-0 z-0 transition-opacity duration-1000 ${
          immersionRatio > 0.5 ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        }`}
        title={immersionRatio > 0.5 ? 'Drag 360° to look around / Tap to ascend' : 'Tap the Moon to immerse into the landscape'}
      />

      {/* TOP-RIGHT MINIMAL LOCKSCREEN HUD CONTROLS */}
      <div className="fixed top-2.5 sm:top-4 right-3 sm:right-6 z-40 flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        {/* Toggle Form Overlay / Pure Zen 360 View */}
        <button
          type="button"
          onClick={() => setIsFormVisible(!isFormVisible)}
          className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 min-h-[38px] rounded-full text-[8.5px] sm:text-[9.5px] uppercase font-mono tracking-widest backdrop-blur-md border border-white/20 bg-black/70 hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer shadow-md touch-manipulation"
          title={isFormVisible ? "Hide Form for Pure 360 Cosmic View" : "Show Outlaw Login Form"}
        >
          {isFormVisible ? <EyeOff className="w-3 h-3 text-red-400" /> : <Eye className="w-3 h-3 text-white" />}
          <span className="hidden xs:inline">{isFormVisible ? 'Zen View' : 'Show Form'}</span>
        </button>

        {/* Minimal Padlock Exit Button */}
        <button
          type="button"
          onClick={() => onToggleLockscreen(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest backdrop-blur-md border border-red-500/80 bg-red-600/90 hover:bg-red-500 text-white transition-all cursor-pointer shadow-[0_0_15px_rgba(255,0,43,0.5)] touch-manipulation group"
          title="Exit 3D Lockscreen and Return to Standard Login Page"
        >
          <Lock className="w-3 h-3 text-white group-hover:rotate-12 transition-transform" />
          <span>Exit Lock</span>
        </button>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2 min-h-[38px] min-w-[38px] rounded-full border border-white/20 bg-black/70 hover:bg-white/10 text-zinc-400 hover:text-white transition-all backdrop-blur-md cursor-pointer flex items-center justify-center touch-manipulation"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ================================================================= */}
      {/* 3D COSMIC LOCKSCREEN HUD OVERLAYS                                 */}
      {/* ================================================================= */}
      <div className="fixed inset-0 z-20 pointer-events-none">
        {/* Cinematic Viewfinder Corner Brackets [ ] */}
        <div className="absolute inset-3 sm:inset-6">
          <div className="absolute top-0 left-0 w-4 h-4 sm:w-5 sm:h-5 border-t border-l border-white/40" />
          <div className="absolute top-0 right-0 w-4 h-4 sm:w-5 sm:h-5 border-t border-r border-white/40" />
          <div className="absolute bottom-0 left-0 w-4 h-4 sm:w-5 sm:h-5 border-b border-l border-white/40" />
          <div className="absolute bottom-0 right-0 w-4 h-4 sm:w-5 sm:h-5 border-b border-r border-white/40" />
        </div>

        {/* Top-Left: Lockscreen Celestial Typestyle */}
        <div className="absolute top-3 sm:top-5 left-3 sm:left-8 max-w-xs sm:max-w-sm pointer-events-auto">
          <div className="text-[8px] sm:text-[9.5px] tracking-[0.3em] text-red-500 uppercase font-mono font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
            <span>{immersionRatio > 0.6 ? 'LUNAR REGOLITH // SURFACE BASE' : 'LUNAR OBSERVATION // ORBIT 01'}</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-4xl font-light tracking-wide text-zinc-100 mt-0.5 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            {immersionRatio > 0.6 ? 'Tranquillity Base' : 'Mare Tranquillitatis'}
          </h1>
          <p className="font-serif italic text-[11px] sm:text-xs text-zinc-400 font-light mt-0.5 tracking-wide leading-relaxed drop-shadow-[0_1px_8px_rgba(0,0,0,0.95)] hidden xs:block">
            {immersionRatio > 0.6 
              ? 'The stillness of the dust looking back toward Earth.' 
              : 'The last horizon before the earthrise.'}
          </p>
        </div>

        {/* Top-Right Secondary Controls */}
        <div className="absolute top-12 sm:top-16 right-3 sm:right-6 flex items-center gap-2 pointer-events-auto">
          {/* Audio Hum Synth */}
          <button
            type="button"
            onClick={toggleAmbientSound}
            className={`p-2 min-h-[36px] min-w-[36px] rounded-xs border transition-all cursor-pointer backdrop-blur-md flex items-center justify-center touch-manipulation ${
              isAudioActive 
                ? 'bg-red-950/80 border-red-500/80 text-red-300 shadow-[0_0_12px_rgba(255,0,43,0.3)]' 
                : 'bg-black/60 border-white/20 text-zinc-400 hover:text-white hover:border-white/40'
            }`}
            title={isAudioActive ? 'Mute Deep Space Audio' : 'Synthesize Deep Space Drone'}
          >
            {isAudioActive ? <Volume2 className="w-3.5 h-3.5 text-red-400" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* Immersion Mode Toggle Button */}
          <button
            type="button"
            onClick={handleToggleImmersion}
            className="px-3 py-1.5 min-h-[36px] rounded-xs border border-white/20 bg-black/60 hover:bg-white/10 text-zinc-200 hover:text-white text-[8.5px] sm:text-[9.5px] uppercase tracking-widest transition-all backdrop-blur-md cursor-pointer flex items-center gap-1.5 touch-manipulation"
          >
            {immersionRatio > 0.5 ? (
              <>
                <ArrowUpCircle className="w-3.5 h-3.5 text-red-400" />
                <span>ORBIT VIEW</span>
              </>
            ) : (
              <>
                <ArrowDownCircle className="w-3.5 h-3.5 text-white" />
                <span>IMMERSION</span>
              </>
            )}
          </button>
        </div>

        {/* Right Edge: Vertical Graduation Scale */}
        <div className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 hidden md:flex flex-col items-end gap-3 text-[8px] text-zinc-500 font-mono">
          <span className={immersionRatio < 0.2 ? 'text-white font-bold' : ''}>00 ORB</span>
          <span className={immersionRatio >= 0.2 && immersionRatio < 0.4 ? 'text-white font-bold' : ''}>25</span>
          <span className={immersionRatio >= 0.4 && immersionRatio < 0.7 ? 'text-white font-bold' : ''}>50</span>
          <span className={immersionRatio >= 0.7 && immersionRatio < 0.95 ? 'text-white font-bold' : ''}>75</span>
          <span className={immersionRatio >= 0.95 ? 'text-red-400 font-bold' : ''}>100 SFC</span>
          <div className="w-[2px] h-32 bg-white/15 relative rounded-full mt-1">
            <div 
              className="absolute left-0 right-0 bg-red-500 transition-all duration-300 rounded-full"
              style={{
                top: `${Math.round(immersionRatio * 100)}%`,
                height: '4px',
                boxShadow: '0 0 8px rgba(255, 0, 43, 0.9)'
              }}
            />
          </div>
        </div>

        {/* Bottom-Left: Live Telemetry */}
        <div className="absolute bottom-3 sm:bottom-6 left-3 sm:left-8 space-y-0.5 sm:space-y-1 text-[8px] sm:text-[9.5px] text-zinc-400 uppercase tracking-widest drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <span>ALT <span className="text-white font-semibold">{formattedAltitude}</span></span>
            <span className="text-zinc-600">//</span>
            <span>HORIZON <span className="text-white font-semibold">1,737.4 KM</span></span>
            <span className="text-zinc-600 hidden sm:inline">//</span>
            <span className="hidden sm:inline">GRAVITY <span className="text-zinc-300 font-semibold">0.166 G</span></span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-zinc-500 text-[7.5px] sm:text-[9px]">
            <span>T - <span className="text-zinc-300 font-medium">{utcTime} UTC</span></span>
            <span className="text-zinc-600">//</span>
            <span>{fps} FPS</span>
            <span className="text-zinc-600 hidden xs:inline">//</span>
            <span className="hidden xs:inline">0.6740° N, 23.4720° E</span>
          </div>
        </div>

        {/* Center-Bottom: Tap to Immerse / 360° Drag Prompt */}
        <div className="absolute bottom-16 sm:bottom-6 inset-x-0 flex justify-center pointer-events-auto px-4">
          <button
            type="button"
            onClick={handleToggleImmersion}
            className="group px-4 py-2 min-h-[42px] bg-black/70 hover:bg-black/90 border border-white/20 hover:border-white/50 backdrop-blur-xl text-zinc-300 hover:text-white transition-all rounded-xs text-[9.5px] sm:text-xs uppercase font-serif tracking-[0.2em] flex items-center gap-2 cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.85)] touch-manipulation"
          >
            <span className="text-red-500 group-hover:scale-125 transition-transform">✧</span>
            <span>
              {immersionRatio > 0.5 
                ? 'Drag 360° to Pan // Tap to Ascend' 
                : 'Tap Moon to Immerse // Descend to Surface'}
            </span>
            <span className="text-red-500 group-hover:scale-125 transition-transform">✧</span>
          </button>
        </div>

        {/* Bottom-Right: Floating WawoloRadio Deck & Return Button */}
        <div className="absolute bottom-3 sm:bottom-6 right-3 sm:right-6 flex items-center gap-2 pointer-events-auto">
          {/* Minimal WawoloRadio Deck */}
          {onToggleRadio && (
            <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 min-h-[42px] bg-black/85 backdrop-blur-xl border border-white/20 rounded-xs shadow-xl">
              <button
                type="button"
                onClick={onToggleRadio}
                className="p-1.5 min-w-[32px] min-h-[32px] rounded-xs bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer flex items-center justify-center touch-manipulation"
                title={isRadioPlaying ? "Pause WawoloRadio" : "Play WawoloRadio"}
              >
                {isRadioPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              </button>
              <div className="max-w-[90px] xs:max-w-[130px] truncate text-left">
                <div className="text-[8.5px] sm:text-[9.5px] font-black uppercase text-white truncate">
                  {radioTrack?.title || "WAWOLORADIO 24/7"}
                </div>
                <div className="text-[7.5px] uppercase text-zinc-400 truncate">
                  {radioTrack?.artist ? `@${radioTrack.artist}` : "@moonsurfers"}
                </div>
              </div>
              {onChangeRadioVolume && (
                <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-white/10">
                  <Volume2 className="w-3 h-3 text-zinc-400" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={radioVolume}
                    onChange={(e) => onChangeRadioVolume(parseFloat(e.target.value))}
                    className="w-12 h-1 accent-red-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => onToggleLockscreen(false)}
            className="px-3 sm:px-3.5 py-2 min-h-[42px] bg-red-600 hover:bg-red-500 text-white text-[9.5px] sm:text-xs font-black uppercase italic font-syne tracking-wider rounded-xs transition-all shadow-[0_0_20px_rgba(255,0,43,0.4)] cursor-pointer flex items-center gap-1.5 touch-manipulation"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Return to Login</span>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* FOREGROUND: MAIN LOGIN PAGE LAYOUT (Maintained over 3D background) */}
      {/* ================================================================= */}
      <div 
        className={`form-card-container relative z-10 w-full min-h-screen flex flex-col justify-center items-center px-3 sm:px-4 py-8 transition-all duration-700 pointer-events-auto ${
          isFormVisible 
            ? 'opacity-100 scale-100' 
            : 'opacity-0 pointer-events-none scale-95'
        }`}
      >
        {children}
      </div>
    </div>
  );
};

export default LunarLockscreen;
