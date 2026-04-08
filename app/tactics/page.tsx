'use client'
import { useState, useEffect, useRef } from 'react'

type Tactic = {
  id: string
  title: string
  content: string
  created_at: string
  updated_at?: string
}

type View = 'list' | 'editor' | 'upload'

export default function TacticsPage() {
  const [tactics, setTactics] = useState<Tactic[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<Tactic | null>(null)

  // Editor state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Upload state
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [extractedPreview, setExtractedPreview] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const mono = { fontFamily: 'Space Mono, monospace' }
  const sans = { fontFamily: 'Syne, sans-serif' }

  async function loadTactics() {
    setLoading(true)
    try {
      const res = await fetch('/api/tactics')
      const data = await res.json()
      setTactics(data.tactics || [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadTactics() }, [])

  function openNew() {
    setSelected(null)
    setTitle('')
    setContent('')
    setMsg(null)
    setView('editor')
  }

  function openEdit(t: Tactic) {
    setSelected(t)
    setTitle(t.title)
    setContent(t.content)
    setMsg(null)
    setView('editor')
  }

  async function saveTactic() {
    if (!title.trim() || !content.trim()) {
      setMsg({ text: 'Título y contenido requeridos', ok: false })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/tactics', {
        method: selected ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected?.id, title, content })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMsg({ text: '✓ Táctica guardada con embeddings', ok: true })
      await loadTactics()
      setTimeout(() => setView('list'), 1200)
    } catch (e: any) {
      setMsg({ text: `✗ ${e.message}`, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function deleteTactic(id: string) {
    if (!confirm('¿Eliminar esta táctica?')) return
    try {
      await fetch('/api/tactics/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      await loadTactics()
      if (selected?.id === id) setView('list')
    } catch {}
  }

  async function handleUpload() {
    if (!uploadFile) {
      setUploadMsg({ text: 'Selecciona un archivo', ok: false })
      return
    }
    setUploading(true)
    setUploadMsg(null)
    setExtractedPreview('')
    try {
      const form = new FormData()
      form.append('file', uploadFile)
      form.append('title', uploadTitle || uploadFile.name.replace(/\.[^.]+$/, ''))

      const res = await fetch('/api/tactics/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setExtractedPreview(data.extracted)
      setUploadMsg({ text: '✓ Táctica extraída y guardada con embeddings', ok: true })
      setUploadFile(null)
      setUploadTitle('')
      if (fileRef.current) fileRef.current.value = ''
      await loadTactics()
    } catch (e: any) {
      setUploadMsg({ text: `✗ ${e.message}`, ok: false })
    } finally {
      setUploading(false)
    }
  }

  const inputStyle = {
    width: '100%', background: '#070a10', border: '1px solid #1e2a40',
    borderRadius: '6px', padding: '10px 14px', color: '#e8eaf0',
    ...mono, fontSize: '13px'
  }

  const btnPrimary = {
    padding: '10px 22px', background: '#00d4a0', color: '#000',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    ...sans, fontSize: '13px', fontWeight: 700
  }

  const btnSecondary = {
    padding: '10px 18px', background: 'transparent',
    border: '1px solid #1e2a40', color: '#5a6480',
    borderRadius: '6px', cursor: 'pointer', ...mono, fontSize: '11px'
  }

  return (
    <div style={{ padding: '32px', maxWidth: '960px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ ...mono, fontSize: '10px', color: '#5a6480', letterSpacing: '3px', marginBottom: '6px' }}>KNOWLEDGE BASE</div>
          <h1 style={{ ...sans, fontSize: '28px', fontWeight: 800, color: '#e8eaf0', margin: 0 }}>Mis Tácticas</h1>
        </div>
        {view === 'list' && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setView('upload'); setUploadMsg(null); setExtractedPreview('') }} style={btnSecondary}>
              ↑ Subir imagen / PDF
            </button>
            <button onClick={openNew} style={btnPrimary}>+ Nueva táctica</button>
          </div>
        )}
        {view !== 'list' && (
          <button onClick={() => setView('list')} style={btnSecondary}>← Volver</button>
        )}
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '8px', padding: '14px 20px' }}>
              <div style={{ ...mono, fontSize: '9px', color: '#5a6480', letterSpacing: '2px', marginBottom: '4px' }}>TÁCTICAS</div>
              <div style={{ ...mono, fontSize: '22px', fontWeight: 700, color: '#00d4a0' }}>{tactics.length}</div>
            </div>
            <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '8px', padding: '14px 20px', flex: 1 }}>
              <div style={{ ...mono, fontSize: '9px', color: '#5a6480', letterSpacing: '2px', marginBottom: '4px' }}>ESTADO RAG</div>
              <div style={{ ...mono, fontSize: '13px', color: tactics.length > 0 ? '#00d4a0' : '#5a6480' }}>
                {tactics.length > 0 ? `✓ Activo — el agente usa ${tactics.length} táctica${tactics.length > 1 ? 's' : ''}` : 'Sin tácticas — agrega tu primera estrategia'}
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', ...mono, fontSize: '12px', color: '#5a6480' }}>Cargando...</div>
          ) : !tactics.length ? (
            <div style={{ background: '#0f1420', border: '1px dashed #1e2a40', borderRadius: '10px', padding: '48px', textAlign: 'center' }}>
              <div style={{ ...mono, fontSize: '12px', color: '#5a6480', marginBottom: '16px' }}>
                Aún no tienes tácticas guardadas
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button onClick={() => setView('upload')} style={btnSecondary}>↑ Subir imagen / PDF</button>
                <button onClick={openNew} style={btnPrimary}>+ Escribir táctica</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tactics.map(t => (
                <div key={t.id} style={{
                  background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px',
                  padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: '16px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...sans, fontSize: '15px', fontWeight: 600, color: '#e8eaf0', marginBottom: '6px' }}>{t.title}</div>
                    <div style={{ ...mono, fontSize: '11px', color: '#5a6480', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '600px' }}>
                      {t.content.slice(0, 120)}...
                    </div>
                    <div style={{ ...mono, fontSize: '9px', color: '#2a3a54', marginTop: '8px' }}>
                      {new Date(t.created_at).toLocaleDateString('es-PA', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}
                      <span style={{ color: '#00d4a0' }}>● embeddings activos</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => openEdit(t)} style={{ ...btnSecondary, padding: '6px 14px', fontSize: '10px' }}>Editar</button>
                    <button onClick={() => deleteTactic(t.id)} style={{ ...btnSecondary, padding: '6px 14px', fontSize: '10px', color: '#ff4d6a', borderColor: 'transparent' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EDITOR VIEW */}
      {view === 'editor' && (
        <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', padding: '28px' }}>
          <div style={{ ...mono, fontSize: '10px', color: '#00d4a0', letterSpacing: '3px', marginBottom: '20px' }}>
            {selected ? 'EDITAR TÁCTICA' : 'NUEVA TÁCTICA'}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', ...mono, fontSize: '10px', color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
              Nombre de la táctica
            </label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Overnight Trade — Setup Principal"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', ...mono, fontSize: '10px', color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
              Descripción de la táctica
            </label>
            <textarea
              value={content} onChange={e => setContent(e.target.value)}
              placeholder="Describe tu estrategia en detalle — timeframes, condiciones de entrada, stop loss, target, reglas de gestión..."
              rows={16}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.6' }}
            />
            <div style={{ ...mono, fontSize: '9px', color: '#2a3a54', marginTop: '4px' }}>
              {content.length} caracteres · Más detalle = mejor contexto para el agente
            </div>
          </div>

          {msg && (
            <div style={{ ...mono, fontSize: '11px', color: msg.ok ? '#00d4a0' : '#ff4d6a', marginBottom: '16px' }}>
              {msg.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={saveTactic} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Guardando + embeddings...' : 'Guardar táctica'}
            </button>
            <button onClick={() => setView('list')} style={btnSecondary}>Cancelar</button>
          </div>
        </div>
      )}

      {/* UPLOAD VIEW */}
      {view === 'upload' && (
        <div>
          <div style={{ background: '#0f1420', border: '1px solid #1e2a40', borderRadius: '10px', padding: '28px', marginBottom: '16px' }}>
            <div style={{ ...mono, fontSize: '10px', color: '#00d4a0', letterSpacing: '3px', marginBottom: '8px' }}>
              SUBIR IMAGEN O PDF
            </div>
            <div style={{ ...mono, fontSize: '11px', color: '#5a6480', marginBottom: '20px' }}>
              Claude Vision analiza tu archivo y extrae automáticamente la táctica de trading
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', ...mono, fontSize: '10px', color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
                Título (opcional)
              </label>
              <input
                value={uploadTitle} onChange={e => setUploadTitle(e.target.value)}
                placeholder="Ej: Overnight Trade — Notas originales"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', ...mono, fontSize: '10px', color: '#5a6480', letterSpacing: '2px', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
                Archivo
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${uploadFile ? '#00d4a0' : '#1e2a40'}`,
                  borderRadius: '8px', padding: '32px', textAlign: 'center',
                  cursor: 'pointer', transition: 'border-color .2s',
                  background: uploadFile ? 'rgba(0,212,160,0.04)' : 'transparent'
                }}
              >
                <div style={{ ...mono, fontSize: '12px', color: uploadFile ? '#00d4a0' : '#5a6480' }}>
                  {uploadFile ? `✓ ${uploadFile.name}` : 'Haz clic para seleccionar imagen o PDF'}
                </div>
                <div style={{ ...mono, fontSize: '10px', color: '#2a3a54', marginTop: '6px' }}>
                  PNG, JPG, PDF — máx 10MB
                </div>
              </div>
              <input
                ref={fileRef} type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                style={{ display: 'none' }}
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>

            {uploadMsg && (
              <div style={{ ...mono, fontSize: '11px', color: uploadMsg.ok ? '#00d4a0' : '#ff4d6a', marginBottom: '16px' }}>
                {uploadMsg.text}
              </div>
            )}

            <button onClick={handleUpload} disabled={uploading || !uploadFile} style={{ ...btnPrimary, opacity: uploading || !uploadFile ? 0.5 : 1 }}>
              {uploading ? 'Analizando con Claude Vision...' : 'Analizar y guardar'}
            </button>
          </div>

          {/* Extracted preview */}
          {extractedPreview && (
            <div style={{ background: '#0f1420', border: '1px solid rgba(0,212,160,0.2)', borderRadius: '10px', padding: '24px' }}>
              <div style={{ ...mono, fontSize: '10px', color: '#00d4a0', letterSpacing: '3px', marginBottom: '12px' }}>
                CONTENIDO EXTRAÍDO
              </div>
              <div style={{ ...mono, fontSize: '12px', color: '#5a6480', lineHeight: '1.8', whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto' }}>
                {extractedPreview}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
