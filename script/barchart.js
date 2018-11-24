/**
 * 3D scene.
 */
var ThreeDScene = new Function();


/**
 * Private attributes.
 */
ThreeDScene.prototype.scene = {};
ThreeDScene.prototype.camera = {};
ThreeDScene.prototype.renderer = {};

// Group of cubes.
ThreeDScene.prototype.cubes = {};

// Amount of cubes created.
ThreeDScene.prototype.cubeCount = 20;

// Cube size.
ThreeDScene.prototype.cubeSize = 15;

// Spacing between cubes.
ThreeDScene.prototype.cubeSpacing = 5;


//ThreeDScene.prototype.width = 768;//384;
//ThreeDScene.prototype.height = 400;//150;

ThreeDScene.prototype.width = window.innerWidth; //384;
ThreeDScene.prototype.height = window.innerHeight; //150;




/**
 * Init scene and start animation.
 */
ThreeDScene.prototype.init = function init() {

    this.scene = new THREE.Scene();
    this.camera();
    this.renderer();
    this.light();
    this.floor();
    this.shapes();
    this.equalizer();
    this.render();
};


/**
 * Init camera.
 */
ThreeDScene.prototype.camera = function() {

    this.camera = new THREE.OrthographicCamera(this.width / -2, this.width / 2, this.height / 2, this.height / -2, 1, 10000);
    this.camera.position.y = 500;
    this.camera.position.z = 500;
    this.camera.position.x = 500;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.scene.position);

};

/**
 * Renderer.
 */
ThreeDScene.prototype.renderer = function() {

    this.renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x202020, 1);
    this.renderer.shadowMapEnabled = true;
    this.renderer.shadowMapType = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

};


/**
 * Lights.
 */
ThreeDScene.prototype.light = function() {

    var shadowlight = new THREE.DirectionalLight(0xffffff, 1.8);
    shadowlight.position.set(0, 50, 0);
    shadowlight.castShadow = true;
    shadowlight.shadowDarkness = 0.1;
    this.scene.add(shadowlight);

    var light = new THREE.DirectionalLight(0xffffff, 1.8);
    light.position.set(60, 100, 20);
    this.scene.add(light);

    var backLight = new THREE.DirectionalLight(0xffffff, 1);
    backLight.position.set(-40, 100, 20);
    this.scene.add(backLight);

};


/**
 * Floor.
 */
ThreeDScene.prototype.floor = function() {

    var geometry = new THREE.PlaneGeometry(500, 500, 1, 1);
    var material = new THREE.MeshBasicMaterial({
        color: 0x202020
    });
    var floor = new THREE.Mesh(geometry, material);
    floor.material.side = THREE.DoubleSide;
    floor.position.y = -150;
    floor.rotation.x = 90 * Math.PI / 180;
    floor.rotation.y = 0;
    floor.rotation.z = 0;
    floor.doubleSided = true;
    floor.receiveShadow = true;
    this.scene.add(floor);

};


/** 
 * Shapes.
 */
ThreeDScene.prototype.shapes = function() {

    // Create group for cubes.
    this.cubes = [];

    // Create bunch of cubes.
    for (var i = 0; i < this.cubeCount; i++) {

        // Create shape and material.
        var geometry = new THREE.BoxGeometry(this.cubeSize, this.cubeSize, this.cubeSize);
        var material = new THREE.MeshLambertMaterial({
            color: 0xF9F8ED,
            shading: THREE.FlatShading
        });
        var shape = new THREE.Mesh(geometry, material);
        //this.shape.rotation.y = -Math.PI/4;

        // Enable shadow.
        shape.castShadow = true;
        shape.receiveShadow = false;

        // Position.
        shape.position.x = (this.cubeSize + this.cubeSpacing) * i - (this.cubeSize + this.cubeSpacing) * this.cubeCount / 2;

        // Add to scene.
        this.cubes.push(shape);
        this.scene.add(shape);

    }

};


/**
 * Equalizer.
 */
ThreeDScene.prototype.equalizer = function() {

    // Start by loading sound.
    // https://www.youtube.com/watch?v=NNAcDJf6118
    this.equalizer = new Equalizer();

}


/**
 * Render method.
 */
ThreeDScene.prototype.render = function() {

    // Apply spectrum.
    for (var i = 0, l = this.cubes.length; i < l; i++) {

        this.cubes[i].scale.y = this.equalizer.getSpectrumByPercentage(i / (this.cubeCount)) / 15;

    }
    //this.shape.scale.x = ;

    // Render scene.
    this.renderer.render(this.scene, this.camera);

    // Request new frame.
    requestAnimationFrame(this.render.bind(this));

};





/**
 * Run da shit when DOM is ready.
 */
document.addEventListener("DOMContentLoaded", function() {

    var threeDScene = new ThreeDScene();
    threeDScene.init();

    var self = this;
    var playButton = document.getElementById("play");
    var loadingLabel = document.getElementById("loading");

    playButton.addEventListener("click", function() {

        playButton.style.display = "none";
        loadingLabel.style.display = "block";
        threeDScene.equalizer.play("/uploads/150801/sexy.mp3", function() {
            loadingLabel.style.display = "none";
        });


    });


});






/********************* EQUALIZER *******************************/
// Based on great tutorial found from:
// https://dzone.com/articles/exploring-html5-web-audio


/**
 * Class for generating audio spectrum.
 */
var Equalizer = new Function();


/**
 * Variables.
 */
Equalizer.prototype.context = new AudioContext();
Equalizer.prototype.audioBuffer = [];
Equalizer.prototype.sourceNode = {};
Equalizer.prototype.analyser = {};
Equalizer.prototype.javascriptNode = {};
Equalizer.prototype.audioData = [];
Equalizer.prototype.fftSize = 512;


/**
 * Load audio file and start playing it.
 */
Equalizer.prototype.play = function(url, loadCallback) {

    var self = this;

    // If AudioContext is not set (which is most probably the case)
    // try to use webkit specific context.
    if (!window.AudioContext) {
        if (!window.webkitAudioContext) {
            alert('no audiocontext found');
        }
        window.AudioContext = window.webkitAudioContext;
    }

    // Create a javascriptnode that is called whenever 
    // the 2048 frames have been sampled.
    this.javascriptNode = this.context.createScriptProcessor(2048, 1, 1);

    // Connect to destination.
    this.javascriptNode.connect(this.context.destination);

    // Bind audio processor.
    this.javascriptNode.onaudioprocess = function() {
        self.processAudio();
    };

    // Setup an analyzer.
    this.analyser = this.context.createAnalyser();
    this.analyser.smoothingTimeConstant = 0.2;

    // The fftSize determine how many buckets we get containing 
    // frequency information. If we have a fftSize of 1024 we get 512 buckets.   
    this.analyser.fftSize = this.fftSize;

    // Create a buffer source node and connect analyzer to it.
    this.sourceNode = this.context.createBufferSource();
    this.sourceNode.connect(this.analyser);

    // Connect analyser to javascriptNode.
    this.analyser.connect(this.javascriptNode);

    // Aaaaand connect sourceNode to destination.
    this.sourceNode.connect(this.context.destination);

    // Then start loading the sound file.
    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    // On load callback.
    request.onload = function() {

        // Decode the data.
        self.context.decodeAudioData(request.response, function(buffer) {

            // Play sound when it's completely decoded.
            self.playSound(buffer);

            if (typeof(loadCallback) !== "unefined") {
                loadCallback();
            }

        }, self.onLoadError);
    }

    // Fire request.
    request.send();

}


/**
 * Start playing sound.
 */
Equalizer.prototype.playSound = function(buffer) {

    this.sourceNode.buffer = buffer;
    this.sourceNode.start(0);

}


/**
 * Audio file couldn't load.
 */
Equalizer.prototype.onLoadError = function(e) {
    console.log(e);
}


/** 
 * Process audio samples and save values to an array.
 */
Equalizer.prototype.processAudio = function() {

    // Get the average for the first channel.
    this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(this.audioData);

}


/** 
 * Return the current spectrum.
 */
Equalizer.prototype.getSpectrum = function() {
    return this.audioData;
}

/** 
 * Return the current spectrum at given bucket.
 */
Equalizer.prototype.getSpectrumAt = function(i) {
    return typeof(this.audioData[i]) !== "undefined" ? this.audioData[i] : 0;
}

/**
 * Get bucket value by giving "frequency percentage" or something.
 * I'm too tired to truly explain what the fuck this method does...
 * just read the source and cry.
 *
 * @param {Number} p Float between 0-1.
 */
Equalizer.prototype.getSpectrumByPercentage = function(p) {
    var i = Math.floor(p * this.audioData.length);

    return typeof(this.audioData[i]) !== "undefined" ? this.audioData[i] : 0;
}