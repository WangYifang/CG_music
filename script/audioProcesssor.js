/*
Audio Visualizer by Raathigeshan.
http://raathigesh.com/
*/

var scene, camera, renderer, controls;
var javascriptNode, audioContext, sourceBuffer, analyser;
var global_material;

var bars = new Array();
var numberOfBars = 60;

$(document).ready(function () {
    initialize();
    createBars();
    loadModel();
    setupAudioProcessing();
    // getAudio();
    handleDrop();
});

//initialize 
function initialize() {
    //generate a ThreeJS Scene
    scene = new THREE.Scene();

    //get the width and height
    var WIDTH = window.innerWidth,
        HEIGHT = window.innerHeight;

    //get the renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(WIDTH, HEIGHT);

    //append the rederer to the body
    document.body.appendChild(renderer.domElement);

    //create and add camera
    camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 20000);
    camera.position.set(0, 45, 0);
    scene.add(camera);

    var that = this;

    //update renderer size, aspect ratio and projection matrix on resize
    window.addEventListener('resize', function () {

        var WIDTH = window.innerWidth,
            HEIGHT = window.innerHeight;

        that.renderer.setSize(WIDTH, HEIGHT);

        that.camera.aspect = WIDTH / HEIGHT;
        that.camera.updateProjectionMatrix();

    });

    //background color of the scene
    renderer.setClearColor(0x000000, 1);
    // renderer.setClearColor(0xc3d7df, 1);

    //create a light and add it to the scene
    var light = new THREE.PointLight(0xfffefa);
    light.position.set(-100, 200, 100);
    scene.add(light);

    //Add interation capability to the scene
    controls = new THREE.OrbitControls(camera, renderer.domElement);
}

//create the bars required to show the visualization
function createBars() {

    //iterate and create bars
    for (var i = 0; i < numberOfBars; i++) {

        //create a bar
        var barGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);

        //create a material
        var material = new THREE.MeshPhongMaterial({
            color: getRandomColor(),
            ambient: 0x808080,
            specular: 0xffffff
        });

        //create the geometry and set the initial position
        bars[i] = new THREE.Mesh(barGeometry, material);
        bars[i].position.set(i - numberOfBars / 2, 0, 0);

        //add the created bar to the scene
        scene.add(bars[i]);
    }
}

//wyf: load 3D models and material
function loadModel() {
    var mtlLoader = new THREE.MTLLoader();
    mtlLoader.setTexturePath("model/robot/");
    mtlLoader.setPath("model/robot/");
    mtlLoader.load("materials.mtl", function (materials) {
        materials.preload();
        global_material = materials;

        var objLoader = new THREE.OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.setPath("model/robot/");
        objLoader.load("model.obj", function (object) {

            console.log("mesh: \n", object.children[0].geometry);

            // Clear mesh in the scene before loading
            for (let i = scene.children.length - 1; i >= 0; --i) {
                if (scene.children[i].type == "Mesh") {
                    scene.remove(scene.children[i]);
                }
            }

            object.position.z += 2;
            scene.add(object);

            // var material = new THREE.MeshBasicMaterial({ color: 0xfffff0 });

            // var geometry = object.children[0].geometry;
            // geometry.attributes.uv2 = geometry.attributes.uv;
            // geometry.center();
            // mesh = new THREE.Mesh(geometry, material);
            // mesh.scale.multiplyScalar(25);
            // scene.add(mesh);

            // var bufferGeometry = object.children[0].geometry;
            // var geometry = new THREE.Geometry().fromBufferGeometry(bufferGeometry);
            // geometry.normalize();
            // bufferGeometry.fromGeometry(geometry);
            // mesh = new THREE.Mesh(bufferGeometry, material);
            // scene.add(mesh);


            // uniforms = { amplitude: { type: "float", value: 0.0 }, uCameraPosition: { type: "vec3", value: new THREE.Vector3() } };

            // // Material using shader
            // material = new THREE.ShaderMaterial({
            //   wireframe: false,
            //   uniforms: uniforms,
            //   vertexShader: document.getElementById("vertexShader").textContent,
            //   fragmentShader: document.getElementById("fragmentShader")
            //     .textContent
            // });

        }, function (xhr) {
            // called when loading is in progresses
            console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
        }, function (error) {
            // called when loading has errors
            console.log("An error happened");
        });
    })
}

function setupAudioProcessing() {
    //get the audio context
    audioContext = new AudioContext();

    //create the javascript node
    javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
    javascriptNode.connect(audioContext.destination);

    //create the source buffer
    sourceBuffer = audioContext.createBufferSource();

    //create the analyser node
    analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0.3;
    analyser.fftSize = 512;

    //connect source to analyser
    sourceBuffer.connect(analyser);

    //analyser to speakers
    analyser.connect(javascriptNode);

    //connect source to analyser
    sourceBuffer.connect(audioContext.destination);

    //this is where we animates the bars
    javascriptNode.onaudioprocess = () => {

        // get the average for the first channel
        const array = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(array);

        //render the scene and update controls
        renderer.render(scene, camera);
        controls.update();

        const step = Math.round(array.length / numberOfBars);

        //Iterate through the bars and scale the z axis
        for (let i = 0; i < numberOfBars; i++) {
            let value = array[i * step] / 4;
            value = Math.max(value, 1) //  value < 1 ? 1 : value;
            bars[i].scale.z = value;
        }
    }
}

//get the default audio from the server
function getAudio() {
    var request = new XMLHttpRequest();
    request.open("GET", "Asset/Aathi-StarMusiQ.Com.mp3", true);
    request.responseType = "arraybuffer";
    request.send();
    request.onload = () => {
        //that.start(request.response);
    }
}

//util method to get random colors to make stuff interesting
function getRandomColor() {
    var letters = '0123456789ABCDEF'.split('');
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

//start the audio processing
function start(buffer) {
    audioContext.decodeAudioData(buffer, decodeAudioDataSuccess, decodeAudioDataFailed);
    var that = this;

    function decodeAudioDataSuccess(decodedBuffer) {
        that.sourceBuffer.buffer = decodedBuffer
        that.sourceBuffer.start(0);
    }

    function decodeAudioDataFailed() {
        debugger
    }
}

function handleDrop() {
    //drag Enter
    document.body.addEventListener("dragenter", function () {

    }, false);

    //drag over
    document.body.addEventListener("dragover", function (e) {
        e.stopPropagation();
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, false);

    //drag leave
    document.body.addEventListener("dragleave", function () {

    }, false);

    //drop
    document.body.addEventListener("drop", function (e) {
        e.stopPropagation();

        e.preventDefault();

        //get the file
        var file = e.dataTransfer.files[0];
        var fileName = file.name;

        $("#guide").text("Playing " + fileName);

        const fileReader = new FileReader();

        fileReader.onload = (e) => {
            var fileResult = e.target.result;
            start(fileResult);
        }

        fileReader.onerror = (e) => {
            debugger
        }

        fileReader.readAsArrayBuffer(file);
    }, false);
}
