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
    // Position camera directly in front, looking at center (will adjust after model loads)
    camera.position.set(0, 0, 4) // Front-facing, further back for better view
    camera.lookAt(0, 0, 0) // Look directly at center (face-on view)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    // Ensure we have valid dimensions
    const width = mountRef.current.clientWidth || 800
    const height = mountRef.current.clientHeight || 600
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mountRef.current.appendChild(renderer.domElement)
    
    // Update camera aspect ratio
    camera.aspect = width / height
    camera.updateProjectionMatrix()

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
      '/e8b2107f-3ad9-4d39-860d-4f50cd82a5d8.glb',
      (gltf) => {
        avatarModel = gltf.scene
        
        // Enable shadows
        avatarModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        // Get bounding box to understand model dimensions
        const box = new THREE.Box3().setFromObject(avatarModel)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        
        // Scale first to get proper size
        const maxDimension = Math.max(size.x, size.y, size.z)
        baseScale = maxDimension > 2 ? 2.5 / maxDimension : 1.3
        avatarModel.scale.set(baseScale, baseScale, baseScale)
        
        // Recalculate bounding box after scaling
        box.setFromObject(avatarModel)
        const scaledCenter = box.getCenter(new THREE.Vector3())
        const scaledSize = box.getSize(new THREE.Vector3())
        
        // Center the model at origin (0, 0, 0)
        avatarModel.position.x = -scaledCenter.x
        avatarModel.position.z = -scaledCenter.z
        
        // Position model so the head (top portion) is visible in center
        // Move model up so head area is near y=0
        // Head is typically at the top of the bounding box
        const headY = box.max.y
        // Position so head is slightly above center (y=0.3 to y=0.5)
        const baseY = -headY + 0.4
        avatarModel.position.y = baseY
        avatarModel.position.x = -scaledCenter.x
        avatarModel.position.z = -scaledCenter.z

        // Ensure avatar faces forward (front-facing, not side profile)
        // If model is rotated in GLB, adjust rotation to face camera
        avatarModel.rotation.y = 0 // Face directly forward (adjust if model is sideways)
        avatarModel.rotation.x = 0 // No tilt
        avatarModel.rotation.z = 0 // No side tilt
        
        // If the model appears sideways, try rotating 90 degrees:
        // avatarModel.rotation.y = Math.PI / 2 // Uncomment if model faces wrong direction

        // Store base position and rotation to keep avatar stable
        sceneRef.current.basePosition = {
          x: avatarModel.position.x,
          y: baseY,
          z: avatarModel.position.z
        }
        sceneRef.current.baseRotation = {
          x: 0,
          y: 0, // Will be 0 for front-facing
          z: 0
        }

        // Position camera directly in front to see face (front-facing view)
        const faceY = baseY + (headY - scaledCenter.y) * baseScale // Calculate face Y position
        camera.position.set(0, faceY * 0.8, 3.5) // Front-facing, slightly above, back enough to see full face
        camera.lookAt(0, faceY, 0) // Look directly at face area
        camera.updateProjectionMatrix()

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
    let talkingOffset = 0
    let neutralHeadRotationX = 0
    let neutralHeadRotationZ = 0
    
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      
      const delta = clock.getDelta()
      
      // Update animation mixer if available
      if (mixer) {
        mixer.update(delta)
      }
      
      if (avatarModel && sceneRef.current.basePosition) {
        // Keep position absolutely stable - no movement, always centered
        avatarModel.position.x = sceneRef.current.basePosition.x
        avatarModel.position.y = sceneRef.current.basePosition.y
        avatarModel.position.z = sceneRef.current.basePosition.z
        
        // Natural talking animation: very subtle head movements only
        if (isTalking) {
          talkingOffset += delta * 3 // Slower, more natural speed
          
          // Very subtle head nod (only X rotation - up/down, like natural speech)
          neutralHeadRotationX = Math.sin(talkingOffset * 1.2) * 0.01 // Very small, natural nod
          
          // Very subtle head tilt (Z rotation - left/right tilt, like listening)
          neutralHeadRotationZ = Math.sin(talkingOffset * 0.6) * 0.008 // Very small tilt
          
          // Apply only subtle head rotations on top of base rotation, keep body completely stable
          if (sceneRef.current.baseRotation) {
            avatarModel.rotation.x = sceneRef.current.baseRotation.x + neutralHeadRotationX
            avatarModel.rotation.z = sceneRef.current.baseRotation.z + neutralHeadRotationZ
            avatarModel.rotation.y = sceneRef.current.baseRotation.y // Always face forward (0)
          } else {
            avatarModel.rotation.x = neutralHeadRotationX
            avatarModel.rotation.z = neutralHeadRotationZ
            avatarModel.rotation.y = 0
          }
          
          // NO scale changes - keep size constant
          avatarModel.scale.set(baseScale, baseScale, baseScale)
        } else {
          // Completely stable - face forward, no rotation when not talking
          if (sceneRef.current.baseRotation) {
            avatarModel.rotation.y = sceneRef.current.baseRotation.y // Always face forward (0)
            avatarModel.rotation.x = sceneRef.current.baseRotation.x // No base tilt
            avatarModel.rotation.z = sceneRef.current.baseRotation.z // No base side tilt
          } else {
            avatarModel.rotation.y = 0 // Always face forward, no rotation
            avatarModel.rotation.x = 0
            avatarModel.rotation.z = 0
          }
          
          // Smoothly return head to neutral (only talking animations)
          neutralHeadRotationX = THREE.MathUtils.lerp(neutralHeadRotationX, 0, 0.2)
          neutralHeadRotationZ = THREE.MathUtils.lerp(neutralHeadRotationZ, 0, 0.2)
          
          // Apply only subtle talking head movements on top of base rotation
          avatarModel.rotation.x = (sceneRef.current.baseRotation?.x || 0) + neutralHeadRotationX
          avatarModel.rotation.z = (sceneRef.current.baseRotation?.z || 0) + neutralHeadRotationZ
          
          // Ensure scale stays constant
          avatarModel.scale.set(baseScale, baseScale, baseScale)
        }
      }
      
      renderer.render(scene, camera)
    }
    animate()

    // Store animation ID for cleanup
    sceneRef.current.animationId = animationId

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current || !renderer) return
      const width = mountRef.current.clientWidth || 800
      const height = mountRef.current.clientHeight || 600
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)
    
    // Initial resize check after a short delay to ensure container is ready
    setTimeout(() => {
      handleResize()
    }, 100)

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
    <div ref={mountRef} className="w-full h-full relative" style={{ minHeight: '400px' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
            <p className="text-white text-sm">Loading Avatar...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded z-10">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}

export default AvatarCanvas
