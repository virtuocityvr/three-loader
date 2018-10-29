import { Group } from 'three';
import { Viewer } from './viewer';

require('./main.css');

const topViewEl = document.createElement('div');
topViewEl.className = 'container1';
document.body.appendChild(topViewEl);

const perspectiveViewEl = document.createElement('div');
perspectiveViewEl.className = 'container2';
document.body.appendChild(perspectiveViewEl);

const viewer = new Viewer();
viewer.initialize(topViewEl, perspectiveViewEl);

let loaded: boolean = false;

const unloadBtn = document.createElement('button');
unloadBtn.textContent = 'Unload';
unloadBtn.addEventListener('click', () => {
  if (!loaded) {
    return;
  }

  viewer.unload();
  loaded = false;
});

const loadBtn = document.createElement('button');
loadBtn.textContent = 'Load';
loadBtn.addEventListener('click', () => {
  if (loaded) {
    return;
  }

  loaded = true;

  viewer
    .load(
      'cloud.js',
      //'https://raw.githubusercontent.com/potree/potree/develop/pointclouds/lion_takanawa/',
      'http://192.168.100.110:8000/pointclouds/Lantana_Heights/colorised/1e91e156-4a1d-4c0d-b351-1b4f7716669e/',
    )
    .then(pco => {
      let group = new Group();
      group.rotateX(-Math.PI / 2); // z is up in our point clouds

      group.add(pco);
      viewer.add(pco, group);
    })
    .catch(err => console.error(err));
});

const btnContainer = document.createElement('div');
btnContainer.className = 'btn-container';
document.body.appendChild(btnContainer);
btnContainer.appendChild(unloadBtn);
btnContainer.appendChild(loadBtn);
loadBtn.click();

const windowBtn = document.createElement('button');
windowBtn.textContent = "Window";
windowBtn.addEventListener('click', () => {
  let child = open("", "Some window", "dependent")!;
  child.document.body.style.width = "100%";
  child.document.body.style.height = "100%";
  child.document.body.style.margin = "0";
  viewer.addWindowRenderer(child);
  console.log("window", child);
});
btnContainer.appendChild(windowBtn);
