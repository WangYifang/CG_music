loadModel = function (filename) {
    var loader = new THREE.OBJLoader();
    loader.load(// resource URL
      "model/" + filename, // called when resource is loaded
      function(object) {
        // Clear mesh in the scene before loading
        for (var i = scene.children.length - 1; i >= 0; --i) {
          if (scene.children[i].type == "Mesh") {
            scene.remove(scene.children[i]);
          }
        }

        uniforms = { amplitude: { type: "float", value: 0.0 }, uCameraPosition: { type: "vec3", value: new THREE.Vector3() } };

        // Material using shader
        material = new THREE.ShaderMaterial({
          wireframe: false,
          uniforms: uniforms,
          vertexShader: document.getElementById("vertexShader").textContent,
          fragmentShader: document.getElementById("fragmentShader")
            .textContent
        });

        var bufferGeometry = object.children[0].geometry;
        var geometry = new THREE.Geometry().fromBufferGeometry(bufferGeometry);
        geometry.normalize();
        bufferGeometry.fromGeometry(geometry);
        mesh = new THREE.Mesh(bufferGeometry, material);

        scene.add(mesh);
      }, // called when loading is in progresses
      function(xhr) {
        console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
      }, // called when loading has errors
      function(error) {
        console.log("An error happened");
      });
}
