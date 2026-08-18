
/**
 * ECHO Web — loader → ECHO tap → cube (рабочая логика)
 */
const DEBUG_HOTSPOTS = false;

const CUBE_MONITORS = {
  gps:  { x: 0.18, y: 0.22, w: 0.20, h: 0.28, label: 'GPS' },
  mon2: { x: 0.40, y: 0.22, w: 0.20, h: 0.28, label: 'MONITOR 2' },
  mon3: { x: 0.62, y: 0.22, w: 0.20, h: 0.28, label: 'MONITOR 3' },
};

const CUBE_VIDEOS = [
  'assets/cube/cube.mp4',
  'assets/cube/boot.mp4',
  'assets/cube/cube.mp4',
];

const stage = document.getElementById('stage');
const crumbsEl = document.getElementById('crumbs');
let cubeUrl = null;
let route = [];

let preloadedCube = null; // hidden <video> fully buffered
let cubeBlobUrl = null;   // blob: URL after first full download — instant every time

async function probe(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { v.removeAttribute('src'); v.load(); } catch (_) {}
      resolve(ok ? url : null);
    };
    v.onloadedmetadata = () => finish(true);
    v.onerror = () => finish(false);
    v.src = url;
    setTimeout(() => finish(false), 5000);
  });
}

async function findCube() {
  for (const u of CUBE_VIDEOS) {
    const ok = await probe(u);
    if (ok) return ok;
  }
  return CUBE_VIDEOS[0];
}

/** Fully buffer the cube video during loader so play is instant. */
function preloadCubeVideo(url) {
  return new Promise(async (resolve) => {
    if (!url) { resolve(null); return; }
    if (preloadedCube && preloadedCube.src && !preloadedCube.error) {
      resolve(preloadedCube);
      return;
    }

    // fetch as blob once → object URL lives forever in session
    if (!cubeBlobUrl) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          cubeBlobUrl = URL.createObjectURL(blob);
          console.log('[ECHO] cube blob ready', (blob.size / 1024 / 1024).toFixed(1) + ' MB');
        }
      } catch (e) {
        console.warn('[ECHO] blob fetch failed, fallback to direct url', e);
      }
    }

    const src = cubeBlobUrl || url;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('muted', '');
    v.preload = 'auto';
    v.disablePictureInPicture = true;
    v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(v);

    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      if (ok) {
        preloadedCube = v;
        console.log('[ECHO] cube fully preloaded');
      } else {
        try { v.remove(); } catch (_) {}
      }
      resolve(ok ? v : null);
    };

    v.addEventListener('canplaythrough', () => done(true), { once: true });
    v.addEventListener('error', () => done(false), { once: true });
    setTimeout(() => done(v.readyState >= 3), 12000);

    v.src = src;
    v.load();
  });
}

function letterboxBox(container, media) {
  const cr = container.getBoundingClientRect();
  const mr = media.getBoundingClientRect();
  return {
    left: mr.left - cr.left,
    top: mr.top - cr.top,
    width: mr.width,
    height: mr.height,
  };
}

function placeHotspot(el, box, rel) {
  el.style.left = (box.left + rel.x * box.width) + 'px';
  el.style.top = (box.top + rel.y * box.height) + 'px';
  el.style.width = (rel.w * box.width) + 'px';
  el.style.height = (rel.h * box.height) + 'px';
}

function makeVideo(src) {
  const v = document.createElement('video');
  v.src = src;
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.setAttribute('muted', '');
  v.preload = 'auto';
  v.disablePictureInPicture = true;
  return v;
}

function renderCrumbs() {
  if (!route.length) {
    crumbsEl.classList.add('hidden');
    crumbsEl.innerHTML = '';
    return;
  }
  crumbsEl.classList.remove('hidden');
  crumbsEl.innerHTML = '';
  route.forEach((p, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '/';
      crumbsEl.appendChild(sep);
    }
    const span = document.createElement('span');
    span.className = 'crumb' + (i === route.length - 1 ? ' active' : '');
    span.textContent = p;
    span.onclick = () => navigate(route.slice(0, i + 1));
    crumbsEl.appendChild(span);
  });
  const tail = document.createElement('span');
  tail.className = 'crumb-sep';
  tail.textContent = '/';
  crumbsEl.appendChild(tail);
}

function navigate(path) {
  route = path.slice();
  renderCrumbs();
  if (route.includes('gps')) showGps();
  else showCube(true);  // always replay cube animation
}

function clearStage() {
  stage.querySelectorAll('video').forEach((v) => {
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch (_) {}
  });
  stage.innerHTML = '';
}

function showLoader() {
  clearStage();
  crumbsEl.classList.add('hidden');

  // preload title image early
  const titlePre = new Image();
  titlePre.src = 'static/echo-title.jpg';

  findCube().then((u) => {
    cubeUrl = u;
    console.log('[ECHO] cube url', cubeUrl);
    // fully buffer while user watches ring/check/pixels
    preloadCubeVideo(u);
  });

  const screen = document.createElement('div');
  screen.className = 'screen';
  const loaderWrap = document.createElement('div');
  loaderWrap.className = 'loader-wrap';

  loaderWrap.innerHTML = `
    <div class="loader" id="boot-loader" role="button" tabindex="0" aria-label="ECHO">
      <div class="loader-ring"></div>
      <svg class="loader-check-svg" viewBox="0 0 36 36" aria-hidden="true">
        <path d="M8 19 L15 26 L28 11"/>
      </svg>
      <canvas class="loader-echo-canvas" aria-hidden="true"></canvas>
    </div>
  `;
  screen.appendChild(loaderWrap);
  stage.appendChild(screen);
  const loader = loaderWrap.querySelector('.loader');
  const canvas = loader.querySelector('.loader-echo-canvas');

  // ── pixel reveal of echo-title.jpg ──────────────────────────────────
  function startPixelReveal(onDone) {
    const IMG_SRC = 'static/echo-title.jpg';
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // smaller size
      const maxW = Math.min(140, window.innerWidth * 0.42);
      const scale = maxW / img.width;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const pxSize = 3;
      const cw = Math.ceil(w / pxSize) * pxSize;
      const ch = Math.ceil(h / pxSize) * pxSize;

      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      const off = document.createElement('canvas');
      off.width = cw;
      off.height = ch;
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.drawImage(img, 0, 0, cw, ch);

      const full = octx.getImageData(0, 0, cw, ch);
      const cur  = ctx.createImageData(cw, ch);

      // only non-black / visible blocks — no black pixel noise
      const blocks = [];
      for (let y = 0; y < ch; y += pxSize) {
        for (let x = 0; x < cw; x += pxSize) {
          let hasContent = false;
          for (let dy = 0; dy < pxSize && !hasContent; dy++) {
            for (let dx = 0; dx < pxSize; dx++) {
              const px = ((y + dy) * cw + (x + dx)) * 4;
              const a = full.data[px + 3];
              const lum = full.data[px] + full.data[px + 1] + full.data[px + 2];
              if (a > 20 && lum > 40) { hasContent = true; break; }
            }
          }
          if (hasContent) blocks.push({ x, y });
        }
      }
      for (let i = blocks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      }

      const total = blocks.length;
      const duration = 1000;
      const start = performance.now();
      let lastIdx = 0;

      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const target = Math.floor(eased * total);

        for (let i = lastIdx; i < target; i++) {
          const { x, y } = blocks[i];
          for (let dy = 0; dy < pxSize; dy++) {
            for (let dx = 0; dx < pxSize; dx++) {
              const px = ((y + dy) * cw + (x + dx)) * 4;
              cur.data[px]     = full.data[px];
              cur.data[px + 1] = full.data[px + 1];
              cur.data[px + 2] = full.data[px + 2];
              cur.data[px + 3] = full.data[px + 3];
            }
          }
        }
        lastIdx = target;
        ctx.putImageData(cur, 0, 0);

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          ctx.drawImage(off, 0, 0);
          onDone && onDone();
        }
      }
      requestAnimationFrame(frame);
    };

    img.onerror = () => {
      // fallback: just show nothing, still become ready
      console.warn('[ECHO] echo-title.jpg not found');
      onDone && onDone();
    };

    img.src = IMG_SRC;
  }

  setTimeout(() => {
    loader.classList.add('done');                 // ring → check
    setTimeout(() => {
      loader.classList.add('to-echo');            // hide ring+check, show canvas
      startPixelReveal(() => {
        loader.classList.add('ready');
        const open = () => {
          loader.onclick = null;
          loader.ontouchend = null;
          loaderWrap.classList.add('fade-out');
          setTimeout(() => {
            try { loaderWrap.remove(); } catch (_) {}
            route = ['cube'];
            renderCrumbs();
            showCube(true);
          }, 400);
        };
        loader.onclick = open;
        loader.ontouchend = (e) => {
          e.preventDefault();
          open();
        };
      });
    }, 650);
  }, 1100);
}

function showCube(play) {
  clearStage();
  const screen = document.createElement('div');
  screen.className = 'screen';
  const host = document.createElement('div');
  host.className = 'frame-host cube-layout';

  const src = cubeUrl || CUBE_VIDEOS[0];
  if (!src) {
    host.innerHTML = '<div class="placeholder">CUBE MP4<br/>web/assets/cube/cube.mp4</div>';
    screen.appendChild(host);
    stage.appendChild(screen);
    return;
  }

  // prefer in-memory blob → zero network delay on every open
  const playSrc = cubeBlobUrl || src;

  let video;
  if (preloadedCube) {
    video = preloadedCube;
    preloadedCube = null;
    try { video.remove(); } catch (_) {}
    video.style.cssText = '';
    // ensure correct source
    if (!video.src || (cubeBlobUrl && video.src !== cubeBlobUrl)) {
      video.src = playSrc;
    }
    try { video.currentTime = 0; } catch (_) {}
  } else {
    video = makeVideo(playSrc);
  }
  host.appendChild(video);
  screen.appendChild(host);
  stage.appendChild(screen);

  // quietly prepare next instance in background for the following visit
  setTimeout(() => {
    if (!preloadedCube && (cubeBlobUrl || cubeUrl)) {
      preloadCubeVideo(cubeUrl || src);
    }
  }, 400);

  video.addEventListener('error', () => {
    host.innerHTML =
      '<div class="placeholder">не открыл видео<br/>' +
      src +
      '<br/><span style="font-size:11px">H.264 mp4 → web/assets/cube/cube.mp4</span></div>';
  });

  const placeMons = () => {
    host.querySelectorAll('.mon-btn').forEach((n) => n.remove());
    const box = letterboxBox(host, video);
    if (box.width < 20) return;
    Object.entries(CUBE_MONITORS).forEach(([key, rel]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mon-btn hotspot' + (DEBUG_HOTSPOTS ? ' debug' : '');
      const lab = document.createElement('span');
      lab.className = 'mon-label';
      lab.textContent = rel.label;
      btn.appendChild(lab);
      placeHotspot(btn, box, rel);
      btn.onclick = () => {
        if (key === 'gps') navigate(['cube', 'gps']);
        else {
          btn.classList.add('show-label');
          setTimeout(() => btn.classList.remove('show-label'), 800);
        }
      };
      host.appendChild(btn);
    });
  };

  const freeze = () => {
    try {
      video.pause();
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = Math.max(0, video.duration - 0.05);
      }
    } catch (_) {}
    placeMons();
  };

  video.addEventListener('ended', freeze);
  window.addEventListener('resize', () => {
    if (video.paused) placeMons();
  });

  if (play) {
    const start = () => {
      const p = video.play();
      if (p && p.catch) {
        p.catch(() => {
          const tap = document.createElement('button');
          tap.className = 'hint show';
          tap.style.cssText =
            'pointer-events:auto;border:1px solid #3a3d44;background:#111;color:#c4843a;padding:10px 16px;letter-spacing:2px;';
          tap.textContent = 'TAP TO PLAY';
          tap.onclick = () => {
            tap.remove();
            video.play().catch(() => {});
          };
          screen.appendChild(tap);
        });
      }
    };
    if (video.readyState >= 2) start();
    else video.addEventListener('loadeddata', start, { once: true });
  } else {
    video.addEventListener(
      'loadedmetadata',
      () => {
        freeze();
      },
      { once: true }
    );
  }
}

// ── GPS screen: MP4 monitor + cube, затем карта в экране монитора ──
const YANDEX_MAPS_KEY = '2c736b62-6bad-41e9-9404-b02d31d9aab7';
const GPS_SCREEN = { imgW: 1920, imgH: 1080, x: 550, y: 243, w: 831, h: 540 };

function placeMapOverMonitor(host, mediaEl, mapEl) {
  const hr = host.getBoundingClientRect();
  const ir = mediaEl.getBoundingClientRect();
  if (ir.width < 20 || ir.height < 20) return;
  const ox = ir.left - hr.left;
  const oy = ir.top - hr.top;
  const scaleX = ir.width / GPS_SCREEN.imgW;
  const scaleY = ir.height / GPS_SCREEN.imgH;
  mapEl.style.left = (ox + GPS_SCREEN.x * scaleX) + 'px';
  mapEl.style.top = (oy + GPS_SCREEN.y * scaleY) + 'px';
  mapEl.style.width = Math.max(40, GPS_SCREEN.w * scaleX) + 'px';
  mapEl.style.height = Math.max(30, GPS_SCREEN.h * scaleY) + 'px';
}

function showGps() {
  clearStage();
  const screen = document.createElement('div');
  screen.className = 'screen gps-screen';
  screen.innerHTML = `
    <div class="gps-wrap">
      <div class="gps-hud">
        <span class="st-offline" id="gps-st">OFFLINE</span>
        <span class="gps-coords" id="gps-coords"></span>
        <span class="gps-age" id="gps-age"></span>
      </div>
      <div class="gps-body">
        <div class="gps-col gps-monitor" id="gps-mon-host">
          <video class="gps-frame" id="gps-mon-vid" muted playsinline webkit-playsinline preload="auto"></video>
          <div class="gps-map-slot" id="gps-map-slot"></div>
        </div>
        <div class="gps-col gps-cube" id="gps-cube-host">
          <video class="gps-frame" id="gps-cube-vid" muted playsinline webkit-playsinline preload="auto"></video>
        </div>
      </div>
    </div>`;
  stage.appendChild(screen);

  const monVid = document.getElementById('gps-mon-vid');
  const cubeVid = document.getElementById('gps-cube-vid');
  const monHost = document.getElementById('gps-mon-host');
  const mapSlot = document.getElementById('gps-map-slot');

  monVid.src = 'assets/gps/monitor.mp4';
  cubeVid.src = 'assets/gps/cube.mp4';

  let mapReady = false;
  let mapRevealed = false;
  let pending = 2;

  function injectMap() {
    if (mapReady) return;
    mapReady = true;
    const iframe = document.createElement('iframe');
    iframe.className = 'gps-map-frame';
    iframe.title = 'Yandex Map';
    const iconUrl = new URL('assets/maps/marker.png', window.location.href).href;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#0a0a0c;overflow:hidden}</style>
</head><body><div id="map"></div>
<script>
window.__ECHO_KEY__=${JSON.stringify(YANDEX_MAPS_KEY)};
window.__ECHO_LAT__=48.708;window.__ECHO_LON__=44.515;window.__ECHO_ZOOM__=13;
window.__ECHO_ICON__=${JSON.stringify(iconUrl)};
function boot(){
  var key=window.__ECHO_KEY__||'';
  if(!key){document.body.innerHTML='<div style="color:#c4843a;padding:12px;font:12px sans-serif">NO YANDEX KEY</div>';return;}
  var s=document.createElement('script');
  s.src='https://api-maps.yandex.ru/2.1/?apikey='+encodeURIComponent(key)+'&lang=ru_RU';
  s.onload=function(){ if(typeof ymaps!=='undefined') ymaps.ready(init); };
  s.onerror=function(){ document.body.innerHTML='<div style="color:#c4843a;padding:12px;font:12px sans-serif">MAP LOAD FAIL</div>'; };
  document.head.appendChild(s);
}
function init(){
  var map=new ymaps.Map('map',{center:[window.__ECHO_LAT__,window.__ECHO_LON__],zoom:window.__ECHO_ZOOM__,type:'yandex#hybrid',controls:['zoomControl']},{suppressMapOpenBlock:true});
  var marker=new ymaps.Placemark([window.__ECHO_LAT__,window.__ECHO_LON__],{hintContent:'ECHO CUBE'},{
    iconLayout:'default#image',iconImageHref:window.__ECHO_ICON__,iconImageSize:[40,40],iconImageOffset:[-20,-20]
  });
  map.geoObjects.add(marker);
}
boot();
</script></body></html>`;
    iframe.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    mapSlot.innerHTML = '';
    mapSlot.appendChild(iframe);
  }

  function layoutMap() {
    if (!mapRevealed) return;
    placeMapOverMonitor(monHost, monVid, mapSlot);
  }

  function revealMap() {
    if (mapRevealed) return;
    mapRevealed = true;
    injectMap();
    layoutMap();
    mapSlot.classList.add('visible');
  }

  function doneOne() {
    pending -= 1;
    if (pending <= 0) revealMap();
  }

  function runVid(v, onEnd) {
    const freeze = () => {
      try {
        v.pause();
        if (v.duration && isFinite(v.duration)) {
          v.currentTime = Math.max(0, v.duration - 0.05);
        }
      } catch (_) {}
      onEnd && onEnd();
    };
    v.addEventListener('ended', freeze, { once: true });
    v.addEventListener('error', () => onEnd && onEnd(), { once: true });
    const start = () => {
      const p = v.play();
      if (p && p.catch) p.catch(() => freeze());
    };
    if (v.readyState >= 2) start();
    else v.addEventListener('loadeddata', start, { once: true });
  }

  runVid(monVid, doneOne);
  runVid(cubeVid, doneOne);

  window.addEventListener('resize', layoutMap);
  monVid.addEventListener('loadedmetadata', layoutMap);
}

showLoader();
