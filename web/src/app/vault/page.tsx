"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Folder,
  Image as ImageIcon,
  Video,
  Grid3X3,
  List,
  RefreshCw,
  Plus,
  Check,
  X,
  Loader2,
  AlertCircle,
  Music,
} from "lucide-react";
import {
  VaultApiModel,
  VaultApiFolder,
  VaultApiMedia,
  VaultFoldersResponse,
  VaultMediaResponse,
  VaultModelsResponse,
} from "@/types";

const VAULT_API_BASE = 'https://of-message-sender-3qumvbkjdq-uc.a.run.app';

// Helper to get full image URL from API response
// The API proxy endpoint accepts api_key as a query parameter for <img> tags
const getImageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  // If it's already a full URL, we can't use it
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return null;
  }
  // Use our local proxy endpoint which will add the API key
  return `/api/vault/proxy?path=${encodeURIComponent(path)}`;
};

// Helper to get the best thumbnail URL from a media item
const getThumbnailUrl = (item: VaultApiMedia): string | null => {
  return getImageUrl(item.thumb) || getImageUrl(item.preview) || getImageUrl(item.url);
};

// Helper to get total media count from folder (API doesn't provide a single count field)
const getFolderMediaCount = (folder: VaultApiFolder): number => {
  // If mediaCount or media_count is available, use it
  if (folder.mediaCount !== undefined) return folder.mediaCount;
  if (folder.media_count !== undefined) return folder.media_count;

  // Otherwise, calculate from individual counts
  const photos = folder.photosCount ?? folder.photos_count ?? 0;
  const videos = folder.videosCount ?? folder.videos_count ?? 0;
  const gifs = folder.gifsCount ?? folder.gifs_count ?? 0;
  const audios = folder.audiosCount ?? folder.audios_count ?? 0;

  return photos + videos + gifs + audios;
};

export default function VaultPage() {
  const [models, setModels] = useState<VaultApiModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [folders, setFolders] = useState<VaultApiFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [media, setMedia] = useState<VaultApiMedia[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedMedia, setSelectedMedia] = useState<number[]>([]);

  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isRefreshingAuth, setIsRefreshingAuth] = useState(false);
  const [authRefreshResult, setAuthRefreshResult] = useState<string | null>(null);
  const LIMIT = 50;

  // Track which model the current folders belong to
  const [foldersModelId, setFoldersModelId] = useState<string>("");

  // AbortController ref to cancel in-flight requests when switching models
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch models on mount
  useEffect(() => {
    fetchModels();
  }, []);

  // Fetch folders when model changes
  useEffect(() => {
    // Abort any in-flight requests when switching models
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (selectedModelId) {
      // Clear previous state immediately to prevent stale data issues
      setSelectedFolderId(null);
      setFolders([]);
      setFoldersModelId(""); // Clear to indicate folders are stale
      setMedia([]);
      setSelectedMedia([]); // Clear selected media when switching models
      setError(null); // Clear any previous errors when switching models
      fetchFolders(selectedModelId);
    } else {
      setFolders([]);
      setFoldersModelId("");
      setSelectedFolderId(null);
      setMedia([]);
      setSelectedMedia([]);
      setError(null);
    }
  }, [selectedModelId]);

  // Fetch media when folder changes
  useEffect(() => {
    if (selectedModelId && selectedFolderId !== null) {
      // Only fetch if:
      // 1. The folders belong to the currently selected model
      // 2. The selected folder exists in the current folders list
      const foldersMatchModel = foldersModelId === selectedModelId;
      const folderExists = folders.some(f => f.id === selectedFolderId);

      if (foldersMatchModel && folderExists) {
        setMedia([]);
        setOffset(0);
        fetchMedia(selectedModelId, selectedFolderId, 0);
      }
    } else {
      setMedia([]);
      setTotalCount(0);
      setHasMore(false);
    }
  }, [selectedModelId, selectedFolderId, folders, foldersModelId]);

  const fetchModels = async () => {
    setIsLoadingModels(true);
    setError(null);

    try {
      const response = await fetch('/api/vault?action=models');
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      const data: VaultModelsResponse = await response.json();
      setModels(data.models || []);

      // Auto-select first model
      const firstModel = data.models?.[0];
      if (firstModel) {
        setSelectedModelId(firstModel.model_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const fetchFolders = async (modelId: string) => {
    setIsLoadingFolders(true);
    setError(null);

    try {
      const response = await fetch(`/api/vault/folders?model_id=${encodeURIComponent(modelId)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch folders');
      }
      const data: VaultFoldersResponse = await response.json();
      // Filter out "All media" folder (id=0) as the API doesn't support fetching from it
      const filteredFolders = (data.folders || []).filter(f => f.id !== 0);

      // Sort folders: first by numeric prefix if present, then alphabetically
      const sortedFolders = filteredFolders.sort((a, b) => {
        // Extract numeric prefix like "(04)" from folder names
        const aMatch = a.name.match(/^\((\d+)\)/);
        const bMatch = b.name.match(/^\((\d+)\)/);

        if (aMatch && bMatch) {
          // Both have numeric prefixes - sort by number
          return parseInt(aMatch[1]) - parseInt(bMatch[1]);
        } else if (aMatch) {
          // Only a has prefix - a comes first
          return -1;
        } else if (bMatch) {
          // Only b has prefix - b comes first
          return 1;
        }
        // Neither has prefix - sort alphabetically
        return a.name.localeCompare(b.name);
      });

      // Set folders and mark which model they belong to
      setFolders(sortedFolders);
      setFoldersModelId(modelId);

      // Auto-select first folder with media
      const folderWithMedia = filteredFolders.find(f => getFolderMediaCount(f) > 0);
      if (folderWithMedia) {
        setSelectedFolderId(folderWithMedia.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch folders');
    } finally {
      setIsLoadingFolders(false);
    }
  };

  const fetchMedia = async (modelId: string, folderId: number, currentOffset: number) => {
    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (currentOffset === 0) {
      setIsLoadingMedia(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        model_id: modelId,
        list_id: folderId.toString(),
        limit: LIMIT.toString(),
        offset: currentOffset.toString(),
      });

      const response = await fetch(`/api/vault/media?${params.toString()}`, { signal });

      // Check if request was aborted
      if (signal.aborted) return;

      const data = await response.json();

      if (!response.ok) {
        // Check for specific API errors
        const errorDetail = data?.detail?.error || data?.error || 'Failed to fetch media';
        if (errorDetail.includes('Wrong list id')) {
          throw new Error('Vault access error - credentials may need to be refreshed for this account');
        }
        throw new Error(errorDetail);
      }

      const mediaData = data as VaultMediaResponse;
      if (currentOffset === 0) {
        setMedia(mediaData.media || []);
      } else {
        setMedia(prev => [...prev, ...(mediaData.media || [])]);
      }

      setHasMore(mediaData.has_more || false);
      setTotalCount(mediaData.total_count || 0);
      setOffset(currentOffset + LIMIT);
    } catch (err) {
      // Don't set error if request was aborted (user switched models)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch media');
    } finally {
      setIsLoadingMedia(false);
      setIsLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (selectedModelId && selectedFolderId !== null && hasMore && !isLoadingMore) {
      fetchMedia(selectedModelId, selectedFolderId, offset);
    }
  };

  const handleRefresh = () => {
    if (selectedModelId) {
      fetchFolders(selectedModelId);
      if (selectedFolderId !== null) {
        setMedia([]);
        setOffset(0);
        fetchMedia(selectedModelId, selectedFolderId, 0);
      }
    }
  };

  const handleRefreshAuth = async () => {
    setIsRefreshingAuth(true);
    setAuthRefreshResult(null);
    setError(null);

    try {
      const response = await fetch('/api/vault?action=refresh-auth', { method: 'POST' });
      const data = await response.json();

      if (response.ok && data.success) {
        const authenticated = data.authenticated_models || [];
        const failed = data.failed_models || [];
        setAuthRefreshResult(
          `Auth refreshed. Authenticated: ${authenticated.join(', ') || 'none'}${failed.length > 0 ? `. Failed: ${failed.join(', ')}` : ''}`
        );
        // Refresh models list after auth refresh
        await fetchModels();
      } else {
        setError(`Auth refresh failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh auth');
    } finally {
      setIsRefreshingAuth(false);
    }
  };

  const handleMediaSelect = (mediaId: number) => {
    if (selectedMedia.includes(mediaId)) {
      setSelectedMedia(prev => prev.filter(id => id !== mediaId));
    } else {
      setSelectedMedia(prev => [...prev, mediaId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedMedia.length === media.length) {
      setSelectedMedia([]);
    } else {
      setSelectedMedia(media.map(m => m.id));
    }
  };

  const getMediaTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
      case 'gif':
        return <Video className="h-8 w-8 text-muted-foreground" />;
      case 'audio':
        return <Music className="h-8 w-8 text-muted-foreground" />;
      default:
        return <ImageIcon className="h-8 w-8 text-muted-foreground" />;
    }
  };

  const getMediaTypeBadge = (type: string) => {
    switch (type) {
      case 'video':
        return 'VID';
      case 'gif':
        return 'GIF';
      case 'audio':
        return 'AUD';
      default:
        return 'IMG';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  // Deduplicate models by model_id (no longer filtering by authenticated status
  // since vault API works regardless of that flag)
  const availableModels = models
    .filter((model, index, self) =>
      index === self.findIndex(m => m.model_id === model.model_id)
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Vault</h1>
          <p className="text-muted-foreground">
            Browse and manage your vault media
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedModelId} onValueChange={setSelectedModelId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder={isLoadingModels ? "Loading..." : "Select account"} />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model, index) => (
                <SelectItem key={`${model.model_id}-${index}`} value={model.model_id}>
                  {model.label} ({model.model_id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={!selectedModelId || isLoadingFolders || isLoadingMedia}
            title="Refresh folders and media"
          >
            <RefreshCw className={`h-4 w-4 ${(isLoadingFolders || isLoadingMedia) ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAuth}
            disabled={isRefreshingAuth}
            title="Refresh backend authentication credentials"
          >
            {isRefreshingAuth ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              'Refresh Auth'
            )}
          </Button>
        </div>
      </div>

      {/* Auth Refresh Result */}
      {authRefreshResult && (
        <Card className="border-green-500 bg-green-500/10">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                <span>{authRefreshResult}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setAuthRefreshResult(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
              {error.includes('credentials') && (
                <p className="text-sm text-muted-foreground ml-6">
                  Try clicking &quot;Refresh Auth&quot; button to reload credentials from GCS. If the issue persists, the credentials for this account need to be updated in the GCS bucket.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {!selectedModelId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Folder className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">Select an account to browse vault media</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4 items-start">
          {/* Folders Sidebar */}
          <Card className="lg:col-span-1 lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-lg">Folders</CardTitle>
              {isLoadingFolders && (
                <CardDescription className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-250px)] min-h-[400px] max-h-[600px]">
                <div className="space-y-1 p-4 pt-0">
                  {folders.length === 0 && !isLoadingFolders ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No folders found
                    </p>
                  ) : (
                    folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                          selectedFolderId === folder.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <Folder className="h-4 w-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm">{folder.name}</p>
                          <div className={`text-xs flex items-center gap-2 ${
                            selectedFolderId === folder.id
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}>
                            <span>{getFolderMediaCount(folder).toLocaleString()} items</span>
                            {(folder.photosCount ?? folder.photos_count ?? 0) > 0 && (
                              <span className="flex items-center gap-0.5">
                                <ImageIcon className="h-3 w-3" />
                                {folder.photosCount ?? folder.photos_count}
                              </span>
                            )}
                            {(folder.videosCount ?? folder.videos_count ?? 0) > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Video className="h-3 w-3" />
                                {folder.videosCount ?? folder.videos_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Media Grid */}
          <div className="lg:col-span-3 space-y-4">
            {/* Toolbar */}
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      disabled={media.length === 0}
                    >
                      {selectedMedia.length === media.length && media.length > 0 ? (
                        <>
                          <X className="h-4 w-4 mr-2" />
                          Deselect All
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Select All
                        </>
                      )}
                    </Button>
                    {selectedMedia.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {selectedMedia.length} selected
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={viewMode === "grid" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewMode("grid")}
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewMode("list")}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Media Content */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedFolder?.name || "Select a folder"}
                </CardTitle>
                <CardDescription>
                  {isLoadingMedia ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    `${media.length} of ${totalCount.toLocaleString()} items`
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingMedia ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : media.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Folder className="h-12 w-12 mb-4 opacity-50" />
                    <p>No media in this folder</p>
                  </div>
                ) : viewMode === "grid" ? (
                  <div key={`grid-${selectedModelId}-${selectedFolderId}`} className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                    {media.map((item) => (
                      <button
                        key={`${selectedModelId}-${item.id}`}
                        onClick={() => handleMediaSelect(item.id)}
                        className={`relative aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden border-2 transition-all group ${
                          selectedMedia.includes(item.id)
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-transparent hover:border-muted-foreground/30"
                        }`}
                      >
                        {/* Thumbnail or Icon */}
                        {getThumbnailUrl(item) ? (
                          <img
                            src={getThumbnailUrl(item) || ''}
                            alt={`Media ${item.id}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          getMediaTypeIcon(item.type)
                        )}

                        {/* Selection indicator */}
                        <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          selectedMedia.includes(item.id)
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-white/50 bg-black/20 opacity-0 group-hover:opacity-100"
                        }`}>
                          {selectedMedia.includes(item.id) && (
                            <Check className="h-3 w-3" />
                          )}
                        </div>

                        {/* Duration for videos */}
                        {item.duration && (
                          <Badge
                            variant="secondary"
                            className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0 bg-black/60 text-white"
                          >
                            {formatDuration(item.duration)}
                          </Badge>
                        )}

                        {/* Type badge */}
                        <Badge
                          variant="secondary"
                          className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0"
                        >
                          {getMediaTypeBadge(item.type)}
                        </Badge>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div key={`list-${selectedModelId}-${selectedFolderId}`} className="space-y-2">
                    {media.map((item) => (
                      <div
                        key={`${selectedModelId}-${item.id}`}
                        onClick={() => handleMediaSelect(item.id)}
                        className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedMedia.includes(item.id)
                            ? "bg-primary/10 border border-primary"
                            : "bg-muted/50 hover:bg-muted"
                        }`}
                      >
                        <Checkbox
                          checked={selectedMedia.includes(item.id)}
                          onCheckedChange={() => handleMediaSelect(item.id)}
                        />
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                          {getThumbnailUrl(item) ? (
                            <img
                              src={getThumbnailUrl(item) || ''}
                              alt={`Media ${item.id}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            getMediaTypeIcon(item.type)
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">ID: {item.id}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(item.createdAt ?? item.created_at ?? '').toLocaleDateString()}
                            {item.duration ? ` • ${formatDuration(item.duration)}` : ''}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {item.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Load More */}
                {hasMore && !isLoadingMedia && (
                  <div className="mt-6 text-center">
                    <Button
                      variant="outline"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        `Load More (${media.length} of ${totalCount})`
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selection Actions */}
            {selectedMedia.length > 0 && (
              <Card className="sticky bottom-4 border-primary">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {selectedMedia.length} item{selectedMedia.length > 1 ? "s" : ""} selected
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setSelectedMedia([])}>
                        Clear Selection
                      </Button>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add to Message
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
