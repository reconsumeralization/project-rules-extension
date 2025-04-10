/**
 * SyncView - A utility for synchronizing media playback across multiple views
 * 
 * This module provides functionality to synchronize media playback state
 * (play/pause, seek, volume) across multiple media elements or players.
 */

function SyncView({ sources = [], onSync, options = {} }) {
  // Track all media sources that should be synchronized
  const mediaElements = []
  const activeSource = { current: null }
  const isInitialized = { current: false }
  
  // Default configuration
  const config = {
    syncPlay: true,
    syncPause: true,
    syncSeek: true,
    syncVolume: false,
    seekThreshold: 0.5, // seconds
    ...options
  }

  function initialize() {
    if (isInitialized.current) return
    
    // Register all sources
    sources.forEach(source => {
      if (!source) return
      mediaElements.push(source)
      
      // Set up event listeners for each media element
      if (config.syncPlay || config.syncPause) {
        source.addEventListener('play', handlePlay)
        source.addEventListener('pause', handlePause)
      }
      
      if (config.syncSeek) {
        source.addEventListener('seeked', handleSeek)
      }
      
      if (config.syncVolume) {
        source.addEventListener('volumechange', handleVolumeChange)
      }
    })
    
    isInitialized.current = true
    if (onSync) onSync({ status: 'initialized', elements: mediaElements })
  }
  
  function handlePlay(event) {
    if (!config.syncPlay) return
    
    activeSource.current = event.target
    mediaElements.forEach(element => {
      if (element !== event.target && element.paused) {
        element.play().catch(error => {
          console.error('Failed to synchronize play:', error)
        })
      }
    })
  }
  
  function handlePause(event) {
    if (!config.syncPause) return
    
    activeSource.current = event.target
    mediaElements.forEach(element => {
      if (element !== event.target && !element.paused) {
        element.pause()
      }
    })
  }
  
  function handleSeek(event) {
    if (!config.syncSeek) return
    
    activeSource.current = event.target
    const currentTime = event.target.currentTime
    
    mediaElements.forEach(element => {
      if (element !== event.target) {
        const timeDiff = Math.abs(element.currentTime - currentTime)
        if (timeDiff > config.seekThreshold) {
          element.currentTime = currentTime
        }
      }
    })
  }
  
  function handleVolumeChange(event) {
    if (!config.syncVolume) return
    
    activeSource.current = event.target
    const volume = event.target.volume
    const muted = event.target.muted
    
    mediaElements.forEach(element => {
      if (element !== event.target) {
        element.volume = volume
        element.muted = muted
      }
    })
  }
  
  function destroy() {
    mediaElements.forEach(element => {
      element.removeEventListener('play', handlePlay)
      element.removeEventListener('pause', handlePause)
      element.removeEventListener('seeked', handleSeek)
      element.removeEventListener('volumechange', handleVolumeChange)
    })
    
    mediaElements.length = 0
    activeSource.current = null
    isInitialized.current = false
    
    if (onSync) onSync({ status: 'destroyed' })
  }
  
  function addSource(source) {
    if (!source || mediaElements.includes(source)) return
    
    mediaElements.push(source)
    
    if (isInitialized.current) {
      if (config.syncPlay || config.syncPause) {
        source.addEventListener('play', handlePlay)
        source.addEventListener('pause', handlePause)
      }
      
      if (config.syncSeek) {
        source.addEventListener('seeked', handleSeek)
      }
      
      if (config.syncVolume) {
        source.addEventListener('volumechange', handleVolumeChange)
      }
      
      if (onSync) onSync({ status: 'sourceAdded', element: source })
    }
  }
  
  function removeSource(source) {
    const index = mediaElements.indexOf(source)
    if (index === -1) return
    
    source.removeEventListener('play', handlePlay)
    source.removeEventListener('pause', handlePause)
    source.removeEventListener('seeked', handleSeek)
    source.removeEventListener('volumechange', handleVolumeChange)
    
    mediaElements.splice(index, 1)
    
    if (activeSource.current === source) {
      activeSource.current = mediaElements[0] || null
    }
    
    if (onSync) onSync({ status: 'sourceRemoved', element: source })
  }
  
  // Initialize on creation
  initialize()
  
  return {
    initialize,
    destroy,
    addSource,
    removeSource,
    getSources: () => [...mediaElements],
    getActiveSource: () => activeSource.current,
    getConfig: () => ({ ...config })
  }
}

// Export the SyncView utility
export default SyncView
