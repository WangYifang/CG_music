import Audios from './audioProcesssor'
let actions = []
let action = []
let mixers = []
let doneMixer = 0
let meshHelpers = []
let renderer, camera, scene, gui, light, stats, controls;
var clock = new THREE.Clock();
let musicTempo = 1
let currentMusic = 0

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
        // action.setEffectiveTimeScale(tempo * 0.01)
        musicTempo = tempo
    }, (amplit) => {
        if (action) {
            action.forEach(a => {
                if (currentMusic === 3) {
                    a.setEffectiveTimeScale(musicTempo / a._tempo * Math.min(1.25, Math.max(0.25, amplit / 20)))
                } else if (currentMusic !== 2) {
                    a.setEffectiveTimeScale(musicTempo / a._tempo * Math.min(1, Math.max(0.25, amplit / 30)))
                }
            })

        }
    }, (currentMusicIndex) => {
        const preAction = action
        currentMusic = currentMusicIndex

        // e.action.stop()
        while (action === preAction) {
            if (currentMusic === 2) {// samba
                action = actions[(actions.length - 5) + Math.round(Math.random() * 4)]
            } else {
                action = actions[Math.round(Math.random() * (actions.length - 5))]
            }
        }

        action.forEach((a, i) => {
            a.reset()
            a.play()
            a.setEffectiveTimeScale(musicTempo / a._tempo)
            a.setEffectiveWeight(1)
            if (preAction[i]) {
                a.crossFadeFrom(preAction[i], 1, true)
            }
        })

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
    camera.position.set(500, 400, 600);
}

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);
    scene.fog = new THREE.Fog(0xa0a0a0, 500, 1500);
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
            action.forEach(a => {
                a.play()
            })
        } else {
            action.forEach(a => {
                a.stop()
            })
        }
    });

    datGui.add(gui, "helper").onChange(function (e) {
        meshHelpers.forEach(meshHelper => {
            meshHelper.visible = e;
        })
    })
}

function initLight() {
    scene.add(new THREE.AmbientLight(0x444444));
    light = new THREE.DirectionalLight(0xffffff);
    light.position.set(0, 400, 200);

    light.castShadow = true;
    light.shadow.camera.top = 180;
    light.shadow.camera.bottom = -100;
    light.shadow.camera.left = -120;
    light.shadow.camera.right = 120;

    //告诉平行光需要开启阴影投射
    light.castShadow = true;
    scene.add(light);

}

function cloneFbx(fbx) {
    const clone = fbx.clone(true)
    clone.animations = [...fbx.animations]
    // console.log(fbx.skeleton.getBoneByName)
    // clone.skeleton = { bones: [] }

    const skinnedMeshes = {}
    fbx.traverse(node => {
        if (node.isSkinnedMesh) {
            skinnedMeshes[node.name] = node
        }
    })

    const cloneBones = {}
    const cloneSkinnedMeshes = {}
    clone.traverse(node => {
        if (node.isBone) {
            cloneBones[node.name] = node
        }

        if (node.isSkinnedMesh) {
            cloneSkinnedMeshes[node.name] = node
        }
    })

    for (let name in skinnedMeshes) {
        const skinnedMesh = skinnedMeshes[name]
        const skeleton = skinnedMesh.skeleton
        const cloneSkinnedMesh = cloneSkinnedMeshes[name]

        const orderedCloneBones = []
        for (let i = 0; i < skeleton.bones.length; i++) {
            const cloneBone = cloneBones[skeleton.bones[i].name]
            orderedCloneBones.push(cloneBone)
        }

        cloneSkinnedMesh.bind(
            new THREE.Skeleton(orderedCloneBones, skeleton.boneInverses),
            cloneSkinnedMesh.matrixWorld)

        // For animation to work correctly:
        // clone.skeleton.bones.push(cloneSkinnedMesh)
        // clone.skeleton.bones.push(...orderedCloneBones)
    }

    return clone
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
    // [206.4, 258.3, 264.2, 290.9] 
    //  [103.04, 129.2, 132, 145.5]// 
    const actionTempos = [113.7, 105.6, 90.2, 93.9, 101.4, 142.5, 103.04, 129.2, 132, 145.5, 105.5]
    await Promise.all(actionTempos
        .map(index => new Promise((resolve, reject) => {
            const loader = new THREE.FBXLoader();
            loader.load(`model/fbx/${index}.fbx`, mesh => resolve(mesh), () => { }, err => reject(err))
        })))
        .then(meshes => {
            // 1 first mesh
            const mesh = meshes.shift()
            mesh.animations = [mesh.animations[0], ...meshes.map(m => m.animations[0])]
            console.log("mesh:\n", mesh);
            //添加骨骼辅助
            const meshHelper = new THREE.SkeletonHelper(mesh)
            meshHelpers.push(meshHelper)
            scene.add(meshHelper)

            //设置模型的每个部位都可以投影
            mesh.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(mesh);

            //AnimationMixer是场景中特定对象的动画播放器。当场景中的多个对象独立动画时，可以为每个对象使用一个AnimationMixer
            mesh.mixer = new THREE.AnimationMixer(mesh);
            mixers.push(mesh.mixer)
            actions = mesh.animations.map((a, i) => {
                const action = mesh.mixer.clipAction(a)
                action._tempo = actionTempos[i]
                return [action]
            })
            action = actions[0]

            for(let i = 0; i < 5; ++i) {
                const cloneMesh = cloneFbx(mesh)
                cloneMesh.position.set(70 * (i+1), 0, i % 2 ? 0 : 150)
                scene.add(cloneMesh)
    
                //添加骨骼辅助
                const meshHelper = new THREE.SkeletonHelper(cloneMesh);
                scene.add(meshHelper);
                meshHelpers.push(meshHelper)
                // mixer
                cloneMesh.mixer = new THREE.AnimationMixer(cloneMesh);
                mixers.push(cloneMesh.mixer)
    
                cloneMesh.animations.forEach((a, i) => {
                    const action = cloneMesh.mixer.clipAction(a)
                    action._tempo = actionTempos[i]
                    actions[i].push(action)
                })
            }

            // for chain
            mixers.forEach(mixer => {
                mesh.mixer.addEventListener('loop', e => {
                    doneMixer += 1
                    if(doneMixer === mixers.length) {
                        doneMixer = 0
                        // stop all action
                        const preAction = action
                        // preAction.forEach(a => a.stop())

                        // random pick
                        while (action === preAction) {
                            if (currentMusic === 2) {// samba
                                action = actions[(actions.length - 5) + Math.round(Math.random() * 4)]
                            } else {
                                action = actions[Math.round(Math.random() * (actions.length - 5))]
                            }
                        }
    
                        action.forEach((a, i) => {
                            a.reset()
                            a.play()
                            a.setEffectiveTimeScale(musicTempo / a._tempo)
                            a.setEffectiveWeight(1)
                            a.crossFadeFrom(preAction[i], 1, true)
                        })
                    }
                }); // properties of e: type, action and direction
            })
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
    controls.autoRotate = true;
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
    mixers.forEach(mixer => {
        if (mixer) {
            mixer.update(time);
        }
    })

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

