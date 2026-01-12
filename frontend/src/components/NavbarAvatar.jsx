import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function NavbarAvatar() {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup - compact for navbar
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    // Position camera to show upper body only (chest and above)
    camera.position.set(0, 1.5, 2.8);
    camera.lookAt(0, 1.3, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(60, 60);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(2, 5, 3);
    scene.add(directionalLight);

    // Load GLB model
    const loader = new GLTFLoader();
    let avatarModel = null;
    let mixer = null;
    let rightHandBone = null;
    let clock = new THREE.Clock();
    let waveTime = 0;

    loader.load(
      '/69624d032c16a23c58263de4.glb',
      (gltf) => {
        avatarModel = gltf.scene;
        
        // Enable shadows
        avatarModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(avatarModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        avatarModel.position.x = -center.x;
        avatarModel.position.y = -center.y;
        avatarModel.position.z = -center.z;

        // Scale to fit navbar
        const maxDimension = Math.max(size.x, size.y, size.z);
        if (maxDimension > 2) {
          const scale = 1.5 / maxDimension;
          avatarModel.scale.set(scale, scale, scale);
        }

        scene.add(avatarModel);

        // Find right hand bone for waving animation
        // Try multiple naming conventions
        const possibleHandNames = ['hand', 'wrist', 'right', 'r_hand', 'hand_r', 'rightHand', 'RightHand'];
        avatarModel.traverse((child) => {
          if (child.isBone) {
            const nameLower = child.name.toLowerCase();
            for (const name of possibleHandNames) {
              if (nameLower.includes(name) && !rightHandBone) {
                rightHandBone = child;
                break;
              }
            }
          }
        });
        
        // If no hand bone found, try to find arm bone
        if (!rightHandBone) {
          avatarModel.traverse((child) => {
            if (child.isBone && (child.name.toLowerCase().includes('arm') || 
                                 child.name.toLowerCase().includes('forearm'))) {
              if (!rightHandBone) {
                rightHandBone = child;
              }
            }
          });
        }

        // Setup animations if available
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(avatarModel);
          gltf.animations.forEach((clip) => {
            mixer.clipAction(clip).play();
          });
        }

        setLoading(false);
      },
      undefined,
      (err) => {
        console.error('Error loading avatar:', err);
        setLoading(false);
      }
    );

    // Animation loop with waving
    let animationId = null;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      
      const delta = clock.getDelta();
      waveTime += delta;
      
      // Update animation mixer if available
      if (mixer) {
        mixer.update(delta);
      }

      // Waving animation for right hand
      if (rightHandBone) {
        // Waving motion: rotate hand in a waving pattern
        const waveSpeed = 2.5;
        const waveAmplitude = 0.6;
        // Create a more natural waving motion
        rightHandBone.rotation.z = Math.sin(waveTime * waveSpeed) * waveAmplitude;
        rightHandBone.rotation.y = Math.sin(waveTime * waveSpeed * 0.5) * 0.2;
      } else if (avatarModel) {
        // Fallback: gentle body movement if no hand bone found
        avatarModel.rotation.y = Math.sin(waveTime * 1.5) * 0.15;
      }
      
      // Gentle idle rotation (only if we're not using it for fallback)
      if (avatarModel && rightHandBone) {
        avatarModel.rotation.y = Math.sin(waveTime * 0.5) * 0.1;
      }
      
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
      if (mixer && avatarModel) {
        mixer.uncacheRoot(avatarModel);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative flex items-center">
      <div ref={mountRef} className="w-[60px] h-[60px] relative" />
      {!loading && (
        <div className="absolute -top-1 -right-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-bounce shadow-lg z-10">
          HI
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}

export default NavbarAvatar;
