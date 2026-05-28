// client/src/components/chat/BrandPanel.tsx
import { useState } from 'react'
import { useDeckStore } from '@/store/deck-store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function BrandPanel() {
  const { brand, setBrand } = useDeckStore()
  const [newKeyword, setNewKeyword] = useState('')

  function addKeyword() {
    const kw = newKeyword.trim().toLowerCase()
    if (kw && !brand.styleKeywords.includes(kw)) {
      setBrand({ styleKeywords: [...brand.styleKeywords, kw] })
    }
    setNewKeyword('')
  }

  function removeKeyword(kw: string) {
    setBrand({ styleKeywords: brand.styleKeywords.filter((k) => k !== kw) })
  }

  return (
    <div className="p-4 space-y-4 border-b border-white/10">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
        Brand Setup
      </p>

      <div className="space-y-1">
        <Label className="text-xs text-white/60">Company Name</Label>
        <Input
          value={brand.companyName}
          onChange={(e) => setBrand({ companyName: e.target.value })}
          placeholder="Acme Inc."
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-white/60">Primary</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brand.primaryColor}
              onChange={(e) => setBrand({ primaryColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
            />
            <span className="text-xs text-white/40 font-mono">{brand.primaryColor}</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-white/60">Secondary</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brand.secondaryColor}
              onChange={(e) => setBrand({ secondaryColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
            />
            <span className="text-xs text-white/40 font-mono">{brand.secondaryColor}</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-white/60">Font Family</Label>
        <Input
          value={brand.fontFamily}
          onChange={(e) => setBrand({ fontFamily: e.target.value })}
          placeholder="Inter"
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-white/60">Logo / Visual Identity</Label>
        <Input
          value={brand.logoDescription}
          onChange={(e) => setBrand({ logoDescription: e.target.value })}
          placeholder="Minimal purple wordmark with lightning bolt"
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-white/60">Style Keywords</Label>
        <div className="flex flex-wrap gap-1 min-h-5">
          {brand.styleKeywords.map((kw) => (
            <Badge
              key={kw}
              variant="secondary"
              className="cursor-pointer bg-white/10 hover:bg-red-500/30 text-white/70 transition-colors text-xs"
              onClick={() => removeKeyword(kw)}
            >
              {kw} ×
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            placeholder="bold, minimal, tech..."
            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={addKeyword}
            className="border-white/10 text-white/60 hover:bg-white/10"
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
