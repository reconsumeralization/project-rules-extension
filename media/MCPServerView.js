import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { Box, Typography, Paper, Grid, Button, CircularProgress, Divider } from '@mui/material'
import { fetchMCPDetails, updateMCPStatus } from '../services/mcpService'
import MCPStatusBadge from '../components/MCPStatusBadge'
import MCPVersionHistory from '../components/MCPVersionHistory'
import MCPMetadataDisplay from '../components/MCPMetadataDisplay'
import MCPValidationResults from '../components/MCPValidationResults'
import MCPActionPanel from '../components/MCPActionPanel'
import ErrorDisplay from '../components/ErrorDisplay'

function MCPServerView({ mcpId }) {
  const router = useRouter()
  const [mcpData, setMcpData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    if (!mcpId) return

    async function loadMCPData() {
      setIsLoading(true)
      try {
        const data = await fetchMCPDetails(mcpId)
        setMcpData(data)
        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to load MCP data')
        setMcpData(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadMCPData()
  }, [mcpId])

  async function handleStatusUpdate(newStatus, comment) {
    if (!mcpId || isUpdating) return
    
    setIsUpdating(true)
    try {
      await updateMCPStatus(mcpId, newStatus, comment)
      // Refresh data after update
      const updatedData = await fetchMCPDetails(mcpId)
      setMcpData(updatedData)
    } catch (err) {
      setError(err.message || 'Failed to update MCP status')
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
      <CircularProgress />
    </Box>
  )

  if (error) return <ErrorDisplay message={error} />

  if (!mcpData) return <Typography variant="h6">No MCP data found</Typography>

  return (
    <Box sx={{ p: 3 }}>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Typography variant="h4">{mcpData.title}</Typography>
            <Typography variant="subtitle1" color="text.secondary">
              ID: {mcpData.id} • Created by: {mcpData.author}
            </Typography>
          </Grid>
          <Grid item xs={12} md={4} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <MCPStatusBadge status={mcpData.status} />
          </Grid>
        </Grid>
        
        <Divider sx={{ my: 2 }} />
        
        <Typography variant="body1">{mcpData.description}</Typography>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <MCPMetadataDisplay metadata={mcpData.metadata} />
          <Box sx={{ mt: 3 }}>
            <MCPValidationResults validationResults={mcpData.validationResults} />
          </Box>
        </Grid>
        <Grid item xs={12} md={4}>
          <MCPActionPanel 
            currentStatus={mcpData.status} 
            onStatusUpdate={handleStatusUpdate}
            isUpdating={isUpdating}
          />
          <Box sx={{ mt: 3 }}>
            <MCPVersionHistory versions={mcpData.versionHistory} />
          </Box>
        </Grid>
      </Grid>
    </Box>
  )
}

export default MCPServerView
