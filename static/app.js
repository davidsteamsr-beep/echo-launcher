
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
  if (window.__echoGpsPoll) {
    clearInterval(window.__echoGpsPoll);
    window.__echoGpsPoll = null;
  }
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

// ── GPS: монитор на экране, карта В стекле монитора, куб PIP, coords из config.json ──
const YANDEX_MAPS_KEY = '2c736b62-6bad-41e9-9404-b02d31d9aab7';
// зона стекла на кадре 1920×1080 (как в десктопе)
const GPS_SCREEN = { imgW: 1920, imgH: 1080, x: 550, y: 243, w: 831, h: 540 };

function placeMapInMonitor(host, mediaEl, mapEl) {
  const hr = host.getBoundingClientRect();
  const ir = mediaEl.getBoundingClientRect();
  if (ir.width < 40 || ir.height < 30) return false;
  const ox = ir.left - hr.left;
  const oy = ir.top - hr.top;
  const sx = ir.width / GPS_SCREEN.imgW;
  const sy = ir.height / GPS_SCREEN.imgH;
  mapEl.style.left = (ox + GPS_SCREEN.x * sx) + 'px';
  mapEl.style.top = (oy + GPS_SCREEN.y * sy) + 'px';
  mapEl.style.width = Math.max(48, GPS_SCREEN.w * sx) + 'px';
  mapEl.style.height = Math.max(36, GPS_SCREEN.h * sy) + 'px';
  return true;
}

function showGps() {
  clearStage();
  const screen = document.createElement('div');
  screen.className = 'screen gps-screen';
  screen.innerHTML = `
    <div class="gps-wrap">
      <div class="gps-hud gps-hud-right">
        <span class="gps-coords" id="gps-coords"></span>
        <span class="gps-age" id="gps-age"></span>
        <span class="st-offline" id="gps-st">OFFLINE</span>
      </div>
      <div class="gps-stage" id="gps-stage">
        <div class="gps-mon-host" id="gps-mon-host">
          <video class="gps-mon-vid" id="gps-mon-vid" muted playsinline webkit-playsinline preload="auto"></video>
          <div class="gps-map-slot" id="gps-map-slot">
            <div class="gps-map-loader" id="gps-loader"><div class="gps-loader-ring"></div></div>
            <canvas class="gps-map-reveal" id="gps-reveal"></canvas>
            <iframe class="gps-map-iframe" id="gps-iframe" title="map"></iframe>
          </div>
        </div>
        <video class="gps-cube-pip" id="gps-cube-vid" muted playsinline webkit-playsinline preload="auto"></video>
      </div>
    </div>`;
  stage.appendChild(screen);

  const monHost = document.getElementById('gps-mon-host');
  const monVid = document.getElementById('gps-mon-vid');
  const cubeVid = document.getElementById('gps-cube-vid');
  const mapSlot = document.getElementById('gps-map-slot');
  const iframe = document.getElementById('gps-iframe');
  const loader = document.getElementById('gps-loader');
  const revealCv = document.getElementById('gps-reveal');
  const stEl = document.getElementById('gps-st');
  const coordsEl = document.getElementById('gps-coords');
  const ageEl = document.getElementById('gps-age');

  monVid.src = 'assets/gps/monitor.mp4';
  cubeVid.src = 'assets/gps/cube.mp4';

  let mapInjected = false;
  let mapLive = false;

  function setHud(online, lat, lon, age) {
    stEl.textContent = online ? 'ONLINE' : 'OFFLINE';
    stEl.className = online ? 'st-online' : 'st-offline';
    coordsEl.textContent =
      lat != null && lon != null
        ? Number(lat).toFixed(5) + '  ' + Number(lon).toFixed(5)
        : '';
    ageEl.textContent = age != null ? age + 's' : '';
  }

  function pushPos(lat, lon) {
    try {
      iframe.contentWindow &&
        iframe.contentWindow.postMessage({ type: 'echo-pos', lat: +lat, lon: +lon }, '*');
    } catch (_) {}
  }

  // координаты ТОЛЬКО из config.json на GitHub (комп туда пишет)
  async function pollGps() {
    try {
      const r = await fetch('config.json?t=' + Date.now() + '&_=' + Math.random(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!r.ok) throw new Error('cfg');
      const j = await r.json();
      const lat = j.lat != null ? Number(j.lat) : null;
      const lon = j.lon != null ? Number(j.lon) : null;
      let age = null;
      if (j.updated) {
        const t = Date.parse(j.updated);
        if (!isNaN(t)) age = Math.round((Date.now() - t) / 1000);
      }
      if (j.age_s != null) age = j.age_s;
      const online = !!(j.online && lat != null && lon != null && (age == null || age < 30));
      setHud(online, lat, lon, age);
      if (lat != null && lon != null) pushPos(lat, lon);
    } catch (_) {
      setHud(false, null, null, null);
    }
  }

  function layoutMap() {
    if (!mapLive) return;
    placeMapInMonitor(monHost, monVid, mapSlot);
  }

  function pixelReveal(onDone) {
    const w = mapSlot.clientWidth || 320;
    const h = mapSlot.clientHeight || 200;
    const px = 4;
    revealCv.width = Math.ceil(w / px) * px;
    revealCv.height = Math.ceil(h / px) * px;
    revealCv.style.width = '100%';
    revealCv.style.height = '100%';
    revealCv.classList.add('show');
    const ctx = revealCv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, revealCv.width, revealCv.height);
    const blocks = [];
    for (let y = 0; y < revealCv.height; y += px)
      for (let x = 0; x < revealCv.width; x += px) blocks.push({ x, y });
    for (let i = blocks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    }
    const total = blocks.length;
    const t0 = performance.now();
    let last = 0;
    function frame(now) {
      const t = Math.min(1, (now - t0) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      const target = Math.floor(eased * total);
      for (let i = last; i < target; i++) {
        const b = blocks[i];
        ctx.clearRect(b.x, b.y, px, px);
      }
      last = target;
      if (t < 1) requestAnimationFrame(frame);
      else {
        revealCv.classList.remove('show');
        onDone && onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  function injectMap() {
    if (mapInjected) return;
    mapInjected = true;
    const iconUrl = new URL('assets/maps/marker.png', location.href).href;
    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
      '<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#0a0a0c;overflow:hidden}' +
      '.ymaps-2-1-copyright,.ymaps-2-1-map-copyrights-promo,.ymaps-2-1-controls-pane,' +
      '[class*="copyright"],[class*="gotoymaps"]{display:none!important}</style></head><body><div id="map"></div><script>' +
      'var map,marker,ICON=' +
      JSON.stringify(iconUrl) +
      ';' +
      'function boot(){var s=document.createElement("script");s.src="https://api-maps.yandex.ru/2.1/?apikey="+' +
      JSON.stringify(YANDEX_MAPS_KEY) +
      '+"&lang=ru_RU";s.onload=function(){ymaps.ready(init);};s.onerror=function(){parent.postMessage({type:"echo-map-error"},"*");};document.head.appendChild(s);}' +
      'function init(){map=new ymaps.Map("map",{center:[48.708,44.515],zoom:14,type:"yandex#hybrid",controls:[]},{suppressMapOpenBlock:true});' +
      'marker=new ymaps.Placemark([48.708,44.515],{hintContent:"ECHO"},{iconLayout:"default#image",iconImageHref:ICON,iconImageSize:[48,48],iconImageOffset:[-24,-24]});' +
      'map.geoObjects.add(marker);parent.postMessage({type:"echo-map-ready"},"*");' +
      'setInterval(function(){document.querySelectorAll("[class*=copyright],[class*=gotoymaps]").forEach(function(n){n.style.display="none";});},800);}' +
      'window.addEventListener("message",function(ev){var d=ev.data||{};if(d.type==="echo-pos"&&map&&marker){var a=+d.lat,b=+d.lon;if(isNaN(a)||isNaN(b))return;marker.geometry.setCoordinates([a,b]);map.setCenter([a,b],map.getZoom(),{duration:200});}});' +
      'boot();</script></body></html>';
    iframe.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  }

  function showMapInGlass() {
    if (mapLive) return;
    mapLive = true;
    placeMapInMonitor(monHost, monVid, mapSlot);
    mapSlot.classList.add('ready');
    loader.classList.add('show');
    injectMap();

    const onMsg = (ev) => {
      if (!ev.data || (ev.data.type !== 'echo-map-ready' && ev.data.type !== 'echo-map-error'))
        return;
      window.removeEventListener('message', onMsg);
      setTimeout(() => {
        loader.classList.remove('show');
        mapSlot.classList.add('live');
        pixelReveal(() => {});
        layoutMap();
      }, 350);
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => {
      if (!mapSlot.classList.contains('live')) {
        loader.classList.remove('show');
        mapSlot.classList.add('live');
        pixelReveal(() => {});
        layoutMap();
      }
    }, 7000);
  }

  function freeze(v) {
    try {
      v.pause();
      if (v.duration && isFinite(v.duration)) v.currentTime = Math.max(0, v.duration - 0.04);
    } catch (_) {}
  }

  let left = 2;
  const done = () => {
    left -= 1;
    if (left <= 0) showMapInGlass();
  };

  function run(v, cb) {
    v.addEventListener('ended', () => { freeze(v); cb(); }, { once: true });
    v.addEventListener('error', () => cb(), { once: true });
    const startPlay = () => {
      const p = v.play();
      if (p && p.catch) p.catch(() => { freeze(v); cb(); });
    };
    if (v.readyState >= 2) startPlay();
    else v.addEventListener('loadeddata', startPlay, { once: true });
  }

  run(monVid, done);
  run(cubeVid, done);

  window.addEventListener('resize', layoutMap);
  monVid.addEventListener('loadedmetadata', layoutMap);

  pollGps();
  window.__echoGpsPoll = setInterval(pollGps, 5000);
}

showLoader();
