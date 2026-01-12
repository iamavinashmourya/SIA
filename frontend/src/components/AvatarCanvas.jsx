import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

function AvatarCanvas({ isTalking = false }) {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const talkingAnimationRef = useRef(null)

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      50, // Narrower FOV for closer view
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    )
    // Position camera to focus on face area (head is typically around y=1.5-1.8)
    camera.position.set(0, 1.6, 1.2) // Closer and focused on face
    camera.lookAt(0, 1.6, 0) // Look at face level

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mountRef.current.appendChild(renderer.domElement)

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 5)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    scene.add(directionalLight)

    // Add a subtle fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3)
    fillLight.position.set(-5, 5, -5)
    scene.add(fillLight)

    // Load GLB model
    const loader = new GLTFLoader()
    let avatarModel = null
    let mixer = null
    let clock = new THREE.Clock()
    let baseScale = 1.0 // Store base scale for animation

    loader.load(
      '/69624d032c16a23c58263de4.glb',
      (gltf) => {
        avatarModel = gltf.scene
        
        // Enable shadows
        avatarModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        // Center and scale the model if needed
        const box = new THREE.Box3().setFromObject(avatarModel)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        
        // Center the model
        avatarModel.position.x = -center.x
        avatarModel.position.y = -center.y
        avatarModel.position.z = -center.z

        // Scale to make face more prominent (larger scale for face focus)
        const maxDimension = Math.max(size.x, size.y, size.z)
        baseScale = maxDimension > 2 ? 2.5 / maxDimension : 1.2
        avatarModel.scale.set(baseScale, baseScale, baseScale)

        scene.add(avatarModel)

        // Setup animations if available
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(avatarModel)
          gltf.animations.forEach((clip) => {
            mixer.clipAction(clip).play()
          })
        }

        setLoading(false)
      },
      (progress) => {
        // Loading progress
        const percent = (progress.loaded / progress.total) * 100
        console.log(`Loading avatar: ${percent.toFixed(2)}%`)
      },
      (err) => {
        console.error('Error loading avatar:', err)
        setError('Failed to load avatar model')
        setLoading(false)
      }
    )

    // Add ground plane for shadows
    const groundGeometry = new THREE.PlaneGeometry(10, 10)
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.2 })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -1
    ground.receiveShadow = true
    scene.add(ground)

    // Store refs for cleanup
    sceneRef.current = { scene, renderer, camera, avatarModel, mixer, clock }

    // Animation loop
    let animationId = null
    let baseRotationY = 0
    let talkingOffset = 0
    
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      
      const delta = clock.getDelta()
      
      // Update animation mixer if available
      if (mixer) {
        mixer.update(delta)
      }
      
      if (avatarModel) {
        // Talking animation: subtle head movements and scale changes
        if (isTalking) {
          talkingOffset += delta * 8 // Speed of talking animation
          // Subtle head bobbing
          avatarModel.rotation.y = baseRotationY + Math.sin(talkingOffset) * 0.05
          avatarModel.rotation.x = Math.sin(talkingOffset * 0.7) * 0.02
          // Subtle scale pulsing (mouth movement effect)
          const scalePulse = 1 + Math.sin(talkingOffset * 2) * 0.02
          avatarModel.scale.set(baseScale * scalePulse, baseScale * scalePulse, baseScale * scalePulse)
        } else {
          // Return to neutral position smoothly
          baseRotationY += 0.002
          avatarModel.rotation.y = baseRotationY
          avatarModel.rotation.x = THREE.MathUtils.lerp(avatarModel.rotation.x, 0, 0.1)
          // Reset scale smoothly
          const currentScale = avatarModel.scale.x
          const targetScale = baseScale
          if (Math.abs(currentScale - targetScale) > 0.001) {
            const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1)
            avatarModel.scale.set(newScale, newScale, newScale)
          }
        }
      }
      
      renderer.render(scene, camera)
    }
    animate()

    // Store animation ID for cleanup
    sceneRef.current.animationId = animationId

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (sceneRef.current?.animationId !== null) {
        cancelAnimationFrame(sceneRef.current.animationId)
      }
      if (mixer && avatarModel) {
        mixer.uncacheRoot(avatarModel)
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
      groundGeometry.dispose()
      groundMaterial.dispose()
    }
  }, [isTalking])

  return (
    <div ref={mountRef} className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-2"></div>
            <p className="text-gray-500 text-sm">Loading Avatar...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}

export default AvatarCanvas
