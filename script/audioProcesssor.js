import { analyze } from 'web-audio-beat-detector'

export default class Audios {
    constructor(scene, renderer, camera, onUpdateTempo, onUpdateAmplite) {
        this.scene = scene
        this.renderer = renderer
        this.camera = camera
        this.onUpdateTempo = onUpdateTempo
        this.onUpdateAmplite = onUpdateAmplite
        this.bars = new Array()
        this.numberOfBars = 60
        this.createBars()
        this.setupAudioProcessing()
        this.getAudio()
        this.handleDrop()
    }

    //create the bars required to show the visualization
    createBars() {

        //iterate and create bars
        for (let i = 0; i < this.numberOfBars; i++) {

            //create a bar
            const barGeometry = new THREE.BoxGeometry(3, 3, 3);

            //create a material
            const material = new THREE.MeshPhongMaterial({
                // color: getRandomColor(),
                color: 0xF9F8ED,
                shading: THREE.FlatShading,
                ambient: 0x808080,
                specular: 0xffffff
            });

            //create the geometry and set the initial position
            this.bars[i] = new THREE.Mesh(barGeometry, material);

            //wyf: 这边希望改成所有的bar围绕成一个圆形（在地板平面上）
            this.bars[i].position.set(-100, 0, ((60 - i) - this.numberOfBars / 2) * 6);

            // Enable shadow.
            this.bars[i].castShadow = true;
            this.bars[i].receiveShadow = false;

            // bars[i].position.set(i - numberOfBars / 2, 0, 0);

            //add the created bar to the scene
            this.scene.add(this.bars[i]);
        }
    }

    setupAudioProcessing() {
        //get the audio context
        this.audioContext = new AudioContext();

        //create the source buffer
        this.sourceBuffer = this.audioContext.createBufferSource();

        //create the javascript node
        this.javascriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);

        //create the analyser node
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.smoothingTimeConstant = 0.3;
        this.analyser.fftSize = 512;

        // 1.1 for the bar chart
        this.sourceBuffer.connect(this.analyser);
        this.analyser.connect(this.javascriptNode);
        this.javascriptNode.connect(this.audioContext.destination);

        // 1.2 for playing
        this.sourceBuffer.connect(this.audioContext.destination);

        //this is where we animates the bars
        this.javascriptNode.onaudioprocess = () => {

            // get the average for the first channel
            const array = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(array);

            //render the scene and update controls
            this.renderer.render(this.scene, this.camera);
            // this.controls.update();

            const step = Math.round(array.length / this.numberOfBars);

            let averageAmpli = 0
            //Iterate through the bars and scale the z axis
            for (var i = 0; i < this.numberOfBars; i++) {
                var value = array[i * step] / 4;
                value = Math.max(value, 1)
                this.bars[i].scale.y = value;
                averageAmpli += value
            }
            averageAmpli /= this.numberOfBars
            this.onUpdateAmplite(averageAmpli)
        }
    }

    //get the default audio from the server
    getAudio() {
        var request = new XMLHttpRequest();
        request.open("GET", "Asset/Aathi-StarMusiQ.Com.mp3", true);
        request.responseType = "arraybuffer";
        request.send();
        request.onload = () => {
            //that.start(request.response);
        }
    }

    //util method to get random colors to make stuff interesting
    getRandomColor() {
        var letters = '0123456789ABCDEF'.split('');
        var color = '#';
        for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    //1. start the audio processing
    start(buffer) {
        this.audioContext.decodeAudioData(buffer,
            async (decodedBuffer) => {
                this.sourceBuffer.buffer = decodedBuffer
                this.sourceBuffer.start(0);

                // No 1 detector
                this.tempo = await analyze(decodedBuffer)
                console.log('music tempo', this.tempo)
                this.onUpdateTempo(this.tempo)
                    // .then(tempo => console.log(`No.1 detector ${tempo}`))

                // No2 detcector
                // const audioData = [];
                // // Take the average of the two channels
                // if (decodedBuffer.numberOfChannels == 2) {
                //     var channel1Data = decodedBuffer.getChannelData(0);
                //     var channel2Data = decodedBuffer.getChannelData(1);
                //     var length = channel1Data.length;
                //     for (var i = 0; i < length; i++) {
                //         audioData[i] = (channel1Data[i] + channel2Data[i]) / 2;
                //     }
                // } else {
                //     audioData = decodedBuffer.getChannelData(0);
                // }
                // var mt = new MusicTempo(audioData);

                // console.log(`No.2 detector ${mt.tempo}`);
                // console.log(`No.2 detector ${mt.beats}`);
            },
            (err) => console.error(err));
    }

    handleDrop() {
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
        document.body.addEventListener("drop", (e) => {
            e.stopPropagation();

            e.preventDefault();

            //get the file
            var file = e.dataTransfer.files[0];
            var fileName = file.name;

            $("#guide").text("Playing " + fileName);

            const fileReader = new FileReader();

            fileReader.onload = (e) => {
                const fileResult = e.target.result;
                this.start(fileResult);
            }

            fileReader.onerror = (e) => {
                debugger
            }

            fileReader.readAsArrayBuffer(file);
        }, false);
    }
}