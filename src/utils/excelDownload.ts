// src/utils/excelDownload.ts - Fixed for large files on Android with FileOpener and Share

import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'

/**
 * WEB BROWSER: Standard Excel download using XLSX.writeFile()
 */
const downloadExcelWeb = (workbook: XLSX.WorkBook, filename: string): void => {
  logger.log('🌐 WEB DOWNLOAD: Using browser download')
  XLSX.writeFile(workbook, filename)
  logger.log('✅ WEB DOWNLOAD: Complete')
}

/**
 * Convert ArrayBuffer to Base64 in chunks to handle large files
 */
const arrayBufferToBase64Chunked = (buffer: ArrayBuffer): string => {
  const uint8Array = new Uint8Array(buffer)
  const chunkSize = 0x8000 // 32KB chunks to avoid call stack issues
  let result = ''
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length))
    result += String.fromCharCode.apply(null, Array.from(chunk))
  }
  
  return btoa(result)
}

/**
 * Try to open file with Excel app using FileOpener plugin
 */
const tryOpenWithExcelApp = async (
  savedPath: string, 
  savedDirectory: any,
  savedLocation: string
): Promise<boolean> => {
  try {
    // Try to import and use FileOpener plugin
    const { FileOpener } = await import('@capacitor-community/file-opener')
    const { Filesystem } = await import('@capacitor/filesystem')
    
    logger.log('📂 Attempting to open file with Excel app...')
    
    // Get the full URI of the saved file
    const fileUri = await Filesystem.getUri({
      path: savedPath,
      directory: savedDirectory
    })
    
    logger.log('📂 File URI for opening:', fileUri.uri)
    
    // Try to open with Excel using proper MIME type
    await FileOpener.open({
      filePath: fileUri.uri,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      openWithDefault: false
    })
    
    logger.log('✅ Successfully opened with Excel app')
    return true
    
  } catch (error: any) {
    logger.log('⚠️ FileOpener failed:', error)
    
    // If FileOpener fails, try with alternative MIME type
    if (error?.message?.includes('No Activity found')) {
      try {
        const { FileOpener } = await import('@capacitor-community/file-opener')
        const { Filesystem } = await import('@capacitor/filesystem')
        
        const fileUri = await Filesystem.getUri({
          path: savedPath,
          directory: savedDirectory
        })
        
        // Try generic Excel MIME type
        await FileOpener.open({
          filePath: fileUri.uri,
          contentType: 'application/vnd.ms-excel',
          openWithDefault: true
        })
        
        logger.log('✅ Opened with alternative MIME type')
        return true
      } catch (altError) {
        logger.log('⚠️ Alternative MIME type also failed:', altError)
      }
    }
    
    // If plugin is not installed
    if (error?.message?.includes('plugin_not_installed')) {
      logger.log('ℹ️ FileOpener plugin not installed - file saved only')
    }
    
    return false
  }
}

/**
 * ANDROID/MOBILE: Capacitor Filesystem download with proper large file handling
 */
const downloadExcelMobile = async (workbook: XLSX.WorkBook, filename: string): Promise<void> => {
  logger.log('📱 MOBILE DOWNLOAD: Using Capacitor Filesystem')
  
  try {
    // Dynamic import to avoid build errors
    const { Capacitor } = await import('@capacitor/core')
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    
    logger.log('📱 Platform:', Capacitor.getPlatform())
    
    // Generate Excel file as array buffer for better compatibility
    const wbout = XLSX.write(workbook, { 
      bookType: 'xlsx',
      type: 'array'
    })
    
    logger.log('📝 Excel generated as array buffer, size:', wbout.length)
    
    // Convert array buffer to base64 properly
    const uint8Array = new Uint8Array(wbout)
    const chunkSize = 0x8000 // 32KB chunks
    let binaryString = ''
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length))
      for (let j = 0; j < chunk.length; j++) {
        binaryString += String.fromCharCode(chunk[j])
      }
    }
    
    const base64Data = btoa(binaryString)
    logger.log('📝 Converted to base64, length:', base64Data.length)
    
    // Log file size estimate
    const estimatedSizeKB = Math.round((base64Data.length * 0.75) / 1024)
    logger.log(`📊 Estimated file size: ${estimatedSizeKB} KB`)

    // For Android, check permissions
    if (Capacitor.getPlatform() === 'android') {
      logger.log('📋 Android detected, checking permissions...')
      
      try {
        const permissions = await Filesystem.checkPermissions()
        logger.log('📋 Current permissions:', permissions)
        
        if (permissions.publicStorage !== 'granted') {
          logger.log('📋 Requesting storage permissions...')
          const permissionResult = await Filesystem.requestPermissions()
          logger.log('📋 Permission result:', permissionResult)
        }
      } catch (permError) {
        logger.log('⚠️ Permission check failed, continuing anyway:', permError)
      }
    }

    let savedSuccessfully = false
    let savedLocation = ''
    let savedDirectory: any = null
    let savedPath = ''

    // Try different storage locations
    const storageAttempts = [
      { 
        directory: Directory.Documents, 
        path: `Download/${filename}`,
        name: 'Documents/Download',
        recursive: true
      },
      { 
        directory: Directory.External, 
        path: filename,
        name: 'Downloads',
        recursive: false
      },
      { 
        directory: Directory.Data, 
        path: filename,
        name: 'App Data',
        recursive: false
      },
      { 
        directory: Directory.Cache, 
        path: filename,
        name: 'Cache (temporary)',
        recursive: false
      }
    ]

    for (const attempt of storageAttempts) {
      try {
        logger.log(`📁 Attempting to save to ${attempt.name}...`)
        
        const writeOptions: any = {
          path: attempt.path,
          data: base64Data,
          directory: attempt.directory
        }
        
        // Only add recursive flag if needed
        if (attempt.recursive) {
          writeOptions.recursive = true
        }
        
        const result = await Filesystem.writeFile(writeOptions)
        
        logger.log(`✅ Saved to ${attempt.name}:`, result)
        savedLocation = attempt.name
        savedDirectory = attempt.directory
        savedPath = attempt.path
        savedSuccessfully = true
        break
        
      } catch (error) {
        logger.log(`⚠️ ${attempt.name} failed:`, error)
        continue
      }
    }

    if (savedSuccessfully) {
      // NO ALERT HERE - REMOVED THE OK BUTTON DIALOG
      // Just log that file was saved
      logger.log(`✅ File saved to ${savedLocation}`)
      
      // Try to open with Excel app immediately - no delay needed
      const openedSuccessfully = await tryOpenWithExcelApp(savedPath, savedDirectory, savedLocation)
      
      if (!openedSuccessfully) {
        // FileOpener didn't work, try share dialog as fallback
        if (Capacitor.getPlatform() === 'android' && navigator.share) {
          try {
            logger.log('📤 Attempting to open share dialog as fallback...')
            
            // Convert base64 back to blob for sharing
            const byteCharacters = atob(base64Data)
            const byteNumbers = new Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i)
            }
            const byteArray = new Uint8Array(byteNumbers)
            const blob = new Blob([byteArray], { 
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
            })
            const file = new File([blob], filename, { 
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
            })
            
            await navigator.share({
              files: [file],
              title: 'Open Excel File',
              text: `Open ${filename} with Excel`
            })
          } catch (shareError) {
            logger.log('⚠️ Share failed:', shareError)
            
            // Only show alert if both open and share failed
            const finalMessage = savedLocation === 'Cache (temporary)'
              ? `File saved temporarily at: ${filename}\n\nUse your file manager to open it.`
              : `File saved to ${savedLocation}: ${filename}\n\nYou can open it from your file manager.`
            
            alert(finalMessage)
          }
        } else {
          // No share API available, just show location
          const finalMessage = `File saved to ${savedLocation}: ${filename}\n\nOpen it from your file manager or Excel app.`
          alert(finalMessage)
        }
      }
      // If opened successfully, no message needed - Excel will open automatically
      
    } else {
      throw new Error('Unable to save file. Please check app permissions.')
    }
    
  } catch (error) {
    logger.error('❌ Mobile download failed:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    if (errorMessage.includes('Permission denied') || errorMessage.includes('EACCES')) {
      alert('Storage permission denied. Please enable storage access for Yardao in your device Settings > Apps > Yardao > Permissions > Storage')
    } else {
      alert(`Download failed: ${errorMessage}`)
    }
    
    throw error
  }
}

/**
 * SHARE FUNCTION: Share Excel file via native share dialog
 */
export const shareExcelFile = async (workbook: XLSX.WorkBook, filename: string): Promise<void> => {
  logger.log('📤 shareExcelFile called')
  logger.log('📤 Filename:', filename)
  
  try {
    // Check if in Capacitor environment
    const isCapacitorEnvironment = typeof window !== 'undefined' && 
                                    (window as any).Capacitor !== undefined
    
    if (isCapacitorEnvironment) {
      const { Capacitor } = await import('@capacitor/core')
      
      if (Capacitor.isNativePlatform()) {
        // PRIORITY 1: Try Capacitor Share plugin for native platforms
        try {
          const { Share } = await import('@capacitor/share')
          const { Filesystem, Directory } = await import('@capacitor/filesystem')
          
          logger.log('📱 Using Capacitor Share plugin')
          
          // Generate Excel file as array buffer
          const wbout = XLSX.write(workbook, { 
            bookType: 'xlsx',
            type: 'array'
          })
          
          logger.log('📝 Excel generated for Capacitor share, array size:', wbout.length)
          
          // Convert to base64 using the same method as download
          const uint8Array = new Uint8Array(wbout)
          const chunkSize = 0x8000 // 32KB chunks
          let binaryString = ''
          
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length))
            for (let j = 0; j < chunk.length; j++) {
              binaryString += String.fromCharCode(chunk[j])
            }
          }
          
          const base64Data = btoa(binaryString)
          logger.log('📝 Converted to base64, length:', base64Data.length)
          
          // Save file temporarily to cache
          const tempPath = `share_${filename}`
          await Filesystem.writeFile({
            path: tempPath,
            data: base64Data,
            directory: Directory.Cache
          })
          
          logger.log('📁 Temp file saved for sharing')
          
          // Get the URI for sharing
          const fileUri = await Filesystem.getUri({
            path: tempPath,
            directory: Directory.Cache
          })
          
          logger.log('📤 Opening Capacitor share dialog with URI:', fileUri.uri)
          
          // Use Capacitor Share plugin
          await Share.share({
            title: 'Share Fleet Data',
            text: `Fleet export: ${filename}`,
            url: fileUri.uri,
            dialogTitle: 'Share Fleet Excel',
          })
          
          logger.log('✅ File shared via Capacitor plugin')
          
          // Clean up temp file after a delay
          setTimeout(async () => {
            try {
              await Filesystem.deleteFile({
                path: tempPath,
                directory: Directory.Cache
              })
              logger.log('🧹 Cleaned up temp file')
            } catch (e) {
              logger.log('Could not delete temp file:', e)
            }
          }, 5000)
          
          return // Success - exit function
          
        } catch (capacitorShareError) {
          logger.log('⚠️ Capacitor Share plugin failed, trying Web Share API:', capacitorShareError)
          // Continue to Web Share API fallback
        }
      }
    }
    
    // FALLBACK: Try Web Share API (works on some Android browsers/WebViews)
    logger.log('🌐 Trying Web Share API...')
    
    // Generate Excel file as array buffer
    const wbout = XLSX.write(workbook, { 
      bookType: 'xlsx',
      type: 'array'
    })
    
    logger.log('📝 Excel generated for Web share, array size:', wbout.length)
    
    // Convert to Blob directly from array buffer
    const blob = new Blob([wbout], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    })
    
    logger.log('📦 Blob created for Web sharing, size:', blob.size)
    
    // Check if Web Share API is available
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        lastModified: Date.now()
      })
      
      const shareData = {
        files: [file],
        title: 'Share Fleet Data',
        text: `Sharing ${filename}`
      }
      
      if (navigator.canShare(shareData)) {
        logger.log('📤 Opening Web share dialog...')
        await navigator.share(shareData)
        logger.log('✅ File shared via Web API')
        return
      }
    }
    
    // FINAL FALLBACK: If share not available, fallback to download
    logger.log('⚠️ No share API available, falling back to download')
    
    // Reuse the isCapacitorEnvironment check from above
    if (isCapacitorEnvironment) {
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        // On mobile without share API, save and try to open
        await downloadExcelMobile(workbook, filename)
        return
      }
    }
    
    // Desktop fallback - just download
    downloadExcelWeb(workbook, filename)
    
  } catch (error) {
    logger.error('❌ Share failed:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Fallback to download if share fails
    alert(`Share failed, downloading instead...\nError: ${errorMessage}`)
    await downloadExcelFile(workbook, filename)
  }
}

/**
 * MAIN FUNCTION: Detects environment and routes to correct download method
 */
export const downloadExcelFile = async (workbook: XLSX.WorkBook, filename: string): Promise<void> => {
  logger.log('🔄 downloadExcelFile called')
  logger.log('🔄 Filename:', filename)
  
  // Log workbook info for debugging
  if (workbook.SheetNames && workbook.SheetNames.length > 0) {
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1')
    const rowCount = range.e.r + 1
    logger.log(`📊 Workbook has ${rowCount} rows (including header)`)
  }
  
  // Check if we're in a Capacitor/mobile environment
  const isCapacitorEnvironment = typeof window !== 'undefined' && 
                                  (window as any).Capacitor !== undefined
  
  logger.log('🔄 Is Capacitor Environment:', isCapacitorEnvironment)
  
  if (!isCapacitorEnvironment) {
    // DEFINITELY WEB - No Capacitor at all
    logger.log('✅ CONFIRMED: Web browser environment')
    downloadExcelWeb(workbook, filename)
    return
  }
  
  // Capacitor exists - check if we're actually in native app
  try {
    const { Capacitor } = await import('@capacitor/core')
    const isNative = Capacitor.isNativePlatform()
    
    logger.log('🔄 Capacitor.isNativePlatform():', isNative)
    logger.log('🔄 Capacitor.getPlatform():', Capacitor.getPlatform())
    
    if (isNative) {
      // MOBILE APP
      logger.log('✅ CONFIRMED: Native mobile app')
      await downloadExcelMobile(workbook, filename)
    } else {
      // WEB (Capacitor loaded but not native)
      logger.log('✅ CONFIRMED: Web browser (Capacitor in dev mode)')
      downloadExcelWeb(workbook, filename)
    }
    
  } catch (error) {
    // If Capacitor import fails, we're definitely on web
    logger.log('✅ CONFIRMED: Web browser (Capacitor import failed)')
    logger.log('Error details:', error)
    downloadExcelWeb(workbook, filename)
  }
}