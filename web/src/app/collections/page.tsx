"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Users,
  Trash2,
  Search,
  UserMinus,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  CollectionsApiCollection,
  CollectionsApiUser,
  VaultApiModel,
} from "@/types";

export default function CollectionsPage() {
  // Models state - use vault API to get authenticated models
  const [models, setModels] = useState<VaultApiModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  // Collections state
  const [collections, setCollections] = useState<CollectionsApiCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | string | null>(null);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);

  // Collection users state
  const [collectionUsers, setCollectionUsers] = useState<CollectionsApiUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const USERS_PER_PAGE = 20;

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch models on mount - use vault API for authenticated models
  useEffect(() => {
    fetchModels();
  }, []);

  // Fetch collections when model changes
  useEffect(() => {
    if (selectedModelId) {
      setSelectedCollectionId(null);
      setCollections([]);
      setCollectionUsers([]);
      fetchCollections(selectedModelId);
    }
  }, [selectedModelId]);

  // Fetch users when collection or page changes
  useEffect(() => {
    if (selectedModelId && selectedCollectionId !== null) {
      fetchCollectionUsers(selectedModelId, selectedCollectionId, currentPage);
    } else {
      setCollectionUsers([]);
      setTotalUsers(0);
      setHasMoreUsers(false);
    }
  }, [selectedModelId, selectedCollectionId, currentPage]);

  // Reset to page 1 when collection changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCollectionId]);

  const fetchModels = async () => {
    setIsLoadingModels(true);
    setError(null);

    try {
      // Use vault API to get authenticated models (same as vault page)
      const response = await fetch('/api/vault?action=models');
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      const data = await response.json();
      const modelsList = data.models || [];

      // Filter to only authenticated models
      const authenticatedModels = modelsList.filter((m: VaultApiModel) => m.authenticated);
      setModels(authenticatedModels);

      // Auto-select first model
      if (authenticatedModels.length > 0) {
        setSelectedModelId(authenticatedModels[0].model_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const fetchCollections = async (modelId: string) => {
    setIsLoadingCollections(true);
    setError(null);

    try {
      const response = await fetch(`/api/collections?model_id=${encodeURIComponent(modelId)}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch collections');
      }

      const data = await response.json();
      setCollections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch collections');
      setCollections([]);
    } finally {
      setIsLoadingCollections(false);
    }
  };

  const fetchCollectionUsers = async (modelId: string, listId: number | string, page: number = 1) => {
    setIsLoadingUsers(true);

    try {
      const offset = (page - 1) * USERS_PER_PAGE;
      const response = await fetch(
        `/api/collections/${listId}/users?model_id=${encodeURIComponent(modelId)}&limit=${USERS_PER_PAGE}&offset=${offset}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch users');
      }

      const data = await response.json();
      // API now returns { users, total, limit, offset, has_more }
      setCollectionUsers(data.users || []);
      setTotalUsers(data.total || 0);
      setHasMoreUsers(data.has_more || false);
    } catch (err) {
      console.error('Error fetching users:', err);
      setCollectionUsers([]);
      setTotalUsers(0);
      setHasMoreUsers(false);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim() || !selectedModelId) return;

    setIsCreatingCollection(true);

    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCollectionName.trim(),
          model_id: selectedModelId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create collection');
      }

      // Refresh collections list
      await fetchCollections(selectedModelId);
      setNewCollectionName("");
      setIsAddDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const handleDeleteCollection = async (listId: number | string) => {
    if (!selectedModelId) return;
    if (!confirm('Are you sure you want to delete this collection?')) return;

    try {
      const response = await fetch(
        `/api/collections/${listId}?model_id=${encodeURIComponent(selectedModelId)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete collection');
      }

      // Refresh collections list
      await fetchCollections(selectedModelId);
      if (selectedCollectionId === listId) {
        setSelectedCollectionId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete collection');
    }
  };

  const handleRemoveUser = async (userId: number) => {
    if (!selectedModelId || selectedCollectionId === null) return;
    if (!confirm('Remove this user from the collection?')) return;

    try {
      const response = await fetch(
        `/api/collections/${selectedCollectionId}/users/${userId}?model_id=${encodeURIComponent(selectedModelId)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove user');
      }

      // Refresh users list
      await fetchCollectionUsers(selectedModelId, selectedCollectionId);
      // Refresh collections to update count
      await fetchCollections(selectedModelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user');
    }
  };

  const handleRefresh = () => {
    if (selectedModelId) {
      fetchCollections(selectedModelId);
      if (selectedCollectionId !== null) {
        fetchCollectionUsers(selectedModelId, selectedCollectionId);
      }
    }
  };

  const activeCollection = collections.find(c => c.id === selectedCollectionId);

  // Filter users by search query (client-side filtering of current page)
  const filteredUsers = searchQuery
    ? collectionUsers.filter(user =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : collectionUsers;

  // Pagination calculations (server-side)
  const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);
  const startIndex = (currentPage - 1) * USERS_PER_PAGE;

  // Sort collections: Fans first, Following second, then by count
  const sortedCollections = [...collections].sort((a, b) => {
    if (a.name === "Fans") return -1;
    if (b.name === "Fans") return 1;
    if (a.name === "Following") return -1;
    if (b.name === "Following") return 1;
    return b.usersCount - a.usersCount;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Collections</h1>
          <p className="text-muted-foreground">
            Organize subscribers into targeted lists
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedModelId} onValueChange={setSelectedModelId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder={isLoadingModels ? "Loading..." : "Select account"} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.model_id} value={model.model_id}>
                  {model.label} ({model.model_id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={!selectedModelId || isLoadingCollections}
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingCollections ? 'animate-spin' : ''}`} />
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!selectedModelId}>
                <Plus className="h-4 w-4 mr-2" />
                Create List
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Collection</DialogTitle>
                <DialogDescription>
                  Create a new list to organize your subscribers.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="listName">List Name</Label>
                  <Input
                    id="listName"
                    placeholder="e.g., VIP Fans"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateCollection}
                  disabled={!newCollectionName.trim() || isCreatingCollection}
                >
                  {isCreatingCollection ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create List'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Model Selected */}
      {!selectedModelId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">Select an account to view collections</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Collections List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>All Collections</CardTitle>
                <CardDescription>
                  {isLoadingCollections ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    `${collections.length} lists total`
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCollections ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : collections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No collections found</p>
                    <p className="text-sm mt-1">Create a new list to get started</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>List Name</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCollections.map((collection) => (
                        <TableRow
                          key={collection.id}
                          className={`cursor-pointer ${selectedCollectionId === collection.id ? "bg-muted" : ""}`}
                          onClick={() => setSelectedCollectionId(collection.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <Users className="h-4 w-4 text-primary" />
                              </div>
                              <span className="font-medium">{collection.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {collection.usersCount.toLocaleString()} users
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground capitalize">
                            {collection.type || 'custom'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {collection.type !== 'system' && typeof collection.id === 'number' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCollection(collection.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Collection Details */}
          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg">List Details</CardTitle>
              </CardHeader>
              <CardContent>
                {activeCollection ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{activeCollection.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {activeCollection.usersCount.toLocaleString()} users
                        </p>
                      </div>
                    </div>

                    {/* Search */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search users..."
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Users List */}
                    <ScrollArea className="h-[280px]">
                      {isLoadingUsers ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          {searchQuery ? 'No users match your search' : 'No users in this collection'}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredUsers.map((user) => (
                            <div
                              key={user.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium overflow-hidden">
                                  {user.avatar ? (
                                    <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    (user.name || user.username).slice(0, 2).toUpperCase()
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium">@{user.username}</p>
                                  {user.name && (
                                    <p className="text-xs text-muted-foreground">{user.name}</p>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleRemoveUser(user.id)}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {startIndex + 1}-{Math.min(startIndex + USERS_PER_PAGE, totalUsers)} of {totalUsers}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <span className="text-xs">&lt;</span>
                          </Button>
                          <span className="text-xs px-2">
                            {currentPage} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <span className="text-xs">&gt;</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      Type: {activeCollection.type || 'custom'}
                    </div>

                    {activeCollection.type !== 'system' && typeof activeCollection.id === 'number' && (
                      <Button
                        variant="destructive"
                        className="w-full"
                        onClick={() => handleDeleteCollection(activeCollection.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Collection
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Select a collection to view details</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
