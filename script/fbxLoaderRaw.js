import Audios from './audioProcesssor'
let actions = []
let renderer, camera, scene, gui, light, stats, controls, meshHelper, mixer, action;
var clock = new THREE.Clock();

window.onload = () => {
    //兼容性判断
    if (!Detector.webgl) Detector.addGetWebGLMessage();

    initGui();
    initRender();
    initScene();
    initCamera();
    initLight();

    // audio things
    const audios = new Audios(scene, renderer, camera, (tempo) => {
        action.setEffectiveTimeScale(tempo * 0.01)
    }, (amplit) => {
        console.log('amplit', Math.log(amplit) / 3)
        if (action) {
            action.setEffectiveWeight(Math.log(amplit) / 4)
        }
    })
    initModel();

    initControls();
    initStats();
    animate();

    window.onresize = onWindowResize;
}

function initRender() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xeeeeee);
    renderer.shadowMap.enabled = true;
    //告诉渲染器需要阴影效果
    document.body.appendChild(renderer.domElement);
}

function initCamera() {
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(300, 200, 400);
}

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);
    scene.fog = new THREE.Fog(0xa0a0a0, 200, 1000);
}

//初始化dat.GUI简化试验流程
function initGui() {
    //声明一个保存需求修改的相关数据的对象
    gui = {
        animation: true,
        helper: true //模型辅助线
    };
    var datGui = new dat.GUI();
    //将设置属性添加到gui当中，gui.add(对象，属性，最小值，最大值）
    datGui.add(gui, "animation").onChange(function (e) {
        if (e) {
            action.play();
        }
        else {
            action.stop();
        }
    });

    datGui.add(gui, "helper").onChange(function (e) {
        meshHelper.visible = e;
    })
}

function initLight() {
    scene.add(new THREE.AmbientLight(0x444444));
    light = new THREE.DirectionalLight(0xffffff);
    light.position.set(0, 200, 100);

    light.castShadow = true;
    light.shadow.camera.top = 180;
    light.shadow.camera.bottom = -100;
    light.shadow.camera.left = -120;
    light.shadow.camera.right = 120;

    //告诉平行光需要开启阴影投射
    light.castShadow = true;
    scene.add(light);

}

async function initModel() {
    //辅助工具
    const helper = new THREE.AxesHelper(50);
    scene.add(helper);

    // 地板
    const floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color: 0xffffff, depthWrite: false }));
    floor.rotation.x = - Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    //添加地板割线
    const grid = new THREE.GridHelper(2000, 20, 0x000000, 0x000000);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    //加载模型
    await Promise.all([1, 2, 3, 4, 5, 6]
        .map(index => new Promise((resolve, reject) => {
            const loader = new THREE.FBXLoader();
            loader.load(`model/fbx/${index}.fbx`, mesh => resolve(mesh), ()=> {}, err => reject(err))
        })))
        .then(meshes => {
            // 1 first mesh
            const mesh = meshes.shift()
            console.log("mesh:\n", mesh);
            //添加骨骼辅助
            meshHelper = new THREE.SkeletonHelper(mesh);

            // console.log(meshHelper);
            scene.add(meshHelper);

            //设置模型的每个部位都可以投影
            mesh.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            //AnimationMixer是场景中特定对象的动画播放器。当场景中的多个对象独立动画时，可以为每个对象使用一个AnimationMixer
            mixer = mesh.mixer = new THREE.AnimationMixer(mesh);
            console.log(mixer.animations)
            //mixer.clipAction 返回一个可以控制动画的AnimationAction对象  参数需要一个AnimationClip 对象
            //AnimationAction.setDuration 设置一个循环所需要的时间，当前设置了一秒
            //告诉AnimationAction启动该动作
            action = mixer.clipAction(mesh.animations[0]);

            action.play();
            actions.push(action)
            scene.add(mesh);

            actions = actions.concat(meshes.map(m => mixer.clipAction(m.animations[0])))
            mixer.addEventListener('loop', e => {
                console.log('finish', e)
                e.action.stop()
                actions[Math.round(Math.random() * (actions.length-1))].play()
            }); // properties of e: type, action and direction
        })
}

//初始化性能插件
function initStats() {

    stats = new Stats();
    document.body.appendChild(stats.dom);

}

function initControls() {
    controls = new THREE.OrbitControls(camera, renderer.domElement);

    //设置控制器的中心点
    // controls.target.set( 0, 100, 0 );
    controls.target = new THREE.Vector3(0, 100, 0);//控制焦点

    // 如果使用animate方法时，将此函数删除
    //controls.addEventListener( 'change', render );
    // 使动画循环使用时阻尼或自转 意思是否有惯性
    controls.enableDamping = true;

    //动态阻尼系数 就是鼠标拖拽旋转灵敏度
    //controls.dampingFactor = 0.25;

    //是否可以缩放
    controls.enableZoom = true;

    //是否自动旋转
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;

    //设置相机距离原点的最远距离
    controls.minDistance = 1;

    //设置相机距离原点的最远距离
    controls.maxDistance = 2000;

    //是否开启右键拖拽
    controls.enablePan = true;
}

function render() {
    var time = clock.getDelta();
    if (mixer) {
        mixer.update(time);
    }
    controls.update();
}

//窗口变动触发的函数

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    //更新控制器
    render();

    //更新性能插件
    stats.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

