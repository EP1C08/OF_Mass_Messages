"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  MoreVertical,
} from "lucide-react";
import { useCaptions } from "@/hooks/useCaptions";
import { CaptionTemplate } from "@/types";

// Tag color mapping
const tagColors: Record<string, string> = {
  confident: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  direct: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  personal: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  exclusive: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  request: "bg-green-500/20 text-green-400 border-green-500/30",
  flirty: "bg-red-500/20 text-red-400 border-red-500/30",
  friendly: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  casual: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const defaultTagColor = "bg-slate-500/20 text-slate-400 border-slate-500/30";

// Helper function to get relative time
function getRelativeTime(dateString?: string): string {
  if (!dateString) return "Never used";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// Helper to truncate caption text
function truncateText(text: string, maxLines: number = 3): string {
  const words = text.split(' ');
  let result = '';
  let lineCount = 0;
  const avgWordsPerLine = 5;

  for (let i = 0; i < words.length && lineCount < maxLines; i++) {
    result += (result ? ' ' : '') + words[i];
    if ((i + 1) % avgWordsPerLine === 0) lineCount++;
  }

  if (result.length < text.length) {
    result = result.trim() + '...';
  }

  return result;
}

export default function CaptionsPage() {
  const { captions, loading, error, createCaption, updateCaption, deleteCaption } = useCaptions();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCaption, setEditingCaption] = useState<CaptionTemplate | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("usage");

  // Form state
  const [formContent, setFormContent] = useState("");
  const [formType, setFormType] = useState<"ppv" | "free">("ppv");
  const [formPrice, setFormPrice] = useState("");
  const [formPriceTier, setFormPriceTier] = useState<string>("");
  const [formTags, setFormTags] = useState("");

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    captions.forEach((c) => c.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [captions]);

  // Get max use count for progress bar calculation
  const maxUseCount = useMemo(() => {
    return Math.max(...captions.map(c => c.useCount), 1);
  }, [captions]);

  // Filter and sort captions
  const filteredCaptions = useMemo(() => {
    let result = [...captions];

    // Filter by tag
    if (selectedTag !== "all") {
      result = result.filter((c) => c.tags?.includes(selectedTag));
    }

    // Sort
    switch (sortBy) {
      case "conversion":
        result.sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0));
        break;
      case "revenue":
        result.sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0));
        break;
      case "usage":
        result.sort((a, b) => b.useCount - a.useCount);
        break;
      case "rpm":
        result.sort((a, b) => (b.rpm || 0) - (a.rpm || 0));
        break;
    }

    return result;
  }, [captions, selectedTag, sortBy]);

  const resetForm = () => {
    setFormContent("");
    setFormType("ppv");
    setFormPrice("");
    setFormPriceTier("");
    setFormTags("");
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (caption: CaptionTemplate) => {
    setEditingCaption(caption);
    setFormContent(caption.content);
    setFormType(caption.type);
    setFormPrice(caption.suggestedPrice?.toString() || "");
    setFormPriceTier(caption.priceTier || "");
    setFormTags(caption.tags?.join(", ") || "");
    setIsEditDialogOpen(true);
  };

  const handleCreate = async () => {
    const tags = formTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t);

    await createCaption({
      content: formContent,
      type: formType,
      suggestedPrice: formType === "ppv" ? parseInt(formPrice) || undefined : undefined,
      priceTier: formType === "ppv" ? (formPriceTier as "low" | "medium" | "high") || undefined : undefined,
      tags: tags.length > 0 ? tags : undefined,
    });

    setIsAddDialogOpen(false);
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingCaption) return;

    const tags = formTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t);

    await updateCaption(editingCaption.id, {
      content: formContent,
      type: formType,
      suggestedPrice: formType === "ppv" ? parseInt(formPrice) || undefined : undefined,
      priceTier: formType === "ppv" ? (formPriceTier as "low" | "medium" | "high") || undefined : undefined,
      tags: tags.length > 0 ? tags : undefined,
    });

    setIsEditDialogOpen(false);
    setEditingCaption(null);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this caption?")) {
      await deleteCaption(id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-muted-foreground">Loading captions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-destructive">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Caption Vault</h1>
          <p className="text-muted-foreground">
            {captions.length} captions
          </p>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Caption
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={selectedTag} onValueChange={setSelectedTag}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="usage">Most Used</SelectItem>
            <SelectItem value="conversion">Best Conversion</SelectItem>
            <SelectItem value="revenue">Highest Revenue</SelectItem>
            <SelectItem value="rpm">Best RPM</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Caption Grid */}
      {filteredCaptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No captions found</p>
          <Button variant="outline" className="mt-4" onClick={handleOpenAdd}>
            Add your first caption
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCaptions.map((caption) => (
            <Card key={caption.id} className="overflow-hidden flex flex-col bg-card hover:bg-accent/5 transition-colors">
              <CardContent className="p-4 flex flex-col h-full">
                {/* Top row: Type badge + Primary tag + Menu */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {/* Type badge */}
                    {caption.type === "ppv" ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30">
                        PPV
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30">
                        FREE
                      </Badge>
                    )}
                    {/* Primary tag */}
                    {caption.tags && caption.tags.length > 0 && (
                      <Badge
                        variant="outline"
                        className={tagColors[caption.tags[0]] || defaultTagColor}
                      >
                        {caption.tags[0]}
                      </Badge>
                    )}
                  </div>
                  {/* Actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenEdit(caption)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(caption.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Caption content preview */}
                <div className="flex-1 mb-4">
                  <p className="text-sm text-foreground leading-relaxed line-clamp-3">
                    &ldquo;{caption.content}&rdquo;
                  </p>
                </div>

                {/* Bottom section with divider */}
                <div className="border-t border-border pt-3 mt-auto">
                  {/* Usage stats row */}
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">
                      Used <span className="text-foreground font-medium">{caption.useCount}x</span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {getRelativeTime(caption.lastUsedAt)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <Progress
                    value={(caption.useCount / maxUseCount) * 100}
                    className="h-1.5"
                  />

                  {/* PPV stats (only for PPV captions) */}
                  {caption.type === "ppv" && (caption.conversionRate || caption.totalRevenue) && (
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      {caption.conversionRate && (
                        <span>
                          <span className="text-green-400">{caption.conversionRate.toFixed(1)}%</span> conv
                        </span>
                      )}
                      {caption.totalRevenue && (
                        <span>
                          <span className="text-green-400">${caption.totalRevenue}</span> rev
                        </span>
                      )}
                      {caption.rpm && (
                        <span>
                          <span className="text-green-400">${caption.rpm}</span> rpm
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Caption</DialogTitle>
            <DialogDescription>Create a new caption template.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="content">Caption Text</Label>
              <Textarea
                id="content"
                placeholder="Enter your caption text..."
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{name}"} for fan name, ${"{price}"} for PPV price
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as "ppv" | "free")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ppv">PPV</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formType === "ppv" && (
                <div className="grid gap-2">
                  <Label htmlFor="price">Suggested Price</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="15"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                  />
                </div>
              )}
            </div>

            {formType === "ppv" && (
              <div className="grid gap-2">
                <Label htmlFor="tier">Price Tier</Label>
                <Select value={formPriceTier} onValueChange={setFormPriceTier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low ($3-10)</SelectItem>
                    <SelectItem value="medium">Medium ($10-30)</SelectItem>
                    <SelectItem value="high">High ($30+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                placeholder="confident, flirty, direct"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated tags</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!formContent.trim()}>
              Add Caption
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Caption</DialogTitle>
            <DialogDescription>Update this caption template.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-content">Caption Text</Label>
              <Textarea
                id="edit-content"
                placeholder="Enter your caption text..."
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{name}"} for fan name, ${"{price}"} for PPV price
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-type">Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as "ppv" | "free")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ppv">PPV</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formType === "ppv" && (
                <div className="grid gap-2">
                  <Label htmlFor="edit-price">Suggested Price</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    placeholder="15"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                  />
                </div>
              )}
            </div>

            {formType === "ppv" && (
              <div className="grid gap-2">
                <Label htmlFor="edit-tier">Price Tier</Label>
                <Select value={formPriceTier} onValueChange={setFormPriceTier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low ($3-10)</SelectItem>
                    <SelectItem value="medium">Medium ($10-30)</SelectItem>
                    <SelectItem value="high">High ($30+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="edit-tags">Tags</Label>
              <Input
                id="edit-tags"
                placeholder="confident, flirty, direct"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Comma-separated tags</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={!formContent.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
