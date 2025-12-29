import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Note } from './types';
import { db } from './services/supabase';
import { supabase } from './services/supabaseClient';
import { encryptData, decryptData, encryptFile, decryptFile } from './services/crypto';

// --- INITIAL CONFIGURATION ---
const INITIAL_CATEGORIES = [
  { id: 'all', label: 'All Notes', icon: '📝' },
  { id: 'To Do', label: 'To Do', icon: '✅' },
  { id: 'Urgent', label: 'Urgent', icon: '⚠️' },
  { id: 'Ideas', label: 'Ideas', icon: '💡' },
  { id: 'Work', label: 'Work', icon: '💼' },
  { id: 'Personal', label: 'Personal', icon: '👤' },
  { id: 'Web Catching', label: 'Web Catching', icon: '🌐' },
];

type SortField = 'date' | 'title' | 'category' | 'security' | 'attachments';
type SortOrder = 'asc' | 'desc';

interface SortOption {
  label: string;
  field: SortField;
  order: SortOrder;
  icon: string;
}

const SORT_OPTIONS: SortOption[] = [
  { label: 'Newest First', field: 'date', order: 'desc', icon: '🕒' },
  { label: 'Oldest First', field: 'date', order: 'asc', icon: '⏳' },
  { label: 'Title (A-Z)', field: 'title', order: 'asc', icon: '🔤' },
  { label: 'Title (Z-A)', field: 'title', order: 'desc', icon: '🔤' },
  { label: 'Secure First', field: 'security', order: 'desc', icon: '🔒' },
  { label: 'Standard First', field: 'security', order: 'asc', icon: '📄' },
  { label: 'With Attachments', field: 'attachments', order: 'desc', icon: '📎' },
  { label: 'Category', field: 'category', order: 'asc', icon: '📁' },
];

const COMMON_ICONS = ['📁', '📝', '✅', '⚠️', '💡', '💼', '👤', '🌐', '🏠', '🔑', '🔒', '🛡️', '🏷️', '📌', '📎', '📅', '📊', '⚙️', '🛠️', '🎨', '📚', '🎬', '🎵', '📷', '✈️', '🏆', '🔥', '✨', '💎', '🌈', '🍕', '⚽', '🎮', '🚗', '🏔️', '💰', '✉️', '📱', '🔔'];

// --- HELPER COMPONENTS ---
const LinkifyText: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline break-all" onClick={(e) => e.stopPropagation()}>{part}</a>
        ) : (part)
      )}
    </>
  );
};

const formatRelativeTime = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getFileNameFromPath = (path: string) => path.split('/').pop()?.replace(/^\^\d+_/, '') || 'Unknown File';

const isTextFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['txt', 'md', 'json', 'js', 'ts', 'log', 'html', 'css', 'csv'].includes(ext || '');
};

const isImageFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '');
};

const isPdfFile = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'pdf';
};

const stripHtml = (html: string) => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
};

// Rich Text Helper
const execCommand = (command: string, value: string = '') => {
  document.execCommand(command, false, value);
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mobile UI Navigation State
  const [mobileView, setMobileView] = useState<'categories' | 'list' | 'note'>('list');

  // Sorting State
  const [sortConfig, setSortConfig] = useState<SortOption>(SORT_OPTIONS[0]);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Selection State
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Vault Security & Indexing
  const [unlockPassword, setUnlockPassword] = useState('');
  const [decryptedCache, setDecryptedCache] = useState<Record<string, { title: string, content: string }>>({});
  const [attachmentTextCache, setAttachmentTextCache] = useState<Record<string, string>>({});
  const [attachmentImageCache, setAttachmentImageCache] = useState<Record<string, string>>({});
  const lockTimerRef = useRef<any>(null);

  // Preview State
  const [previewData, setPreviewData] = useState<{ url: string; name: string; type: string; text?: string } | null>(null);

  // Form States
  const [editForm, setEditForm] = useState({ title: '', content: '', category: 'Personal', is_encrypted: false, password: '', date: '' });
  const [newNote, setNewNote] = useState({ title: '', content: '', encrypt: false, password: '', category: 'Personal', date: new Date().toISOString().slice(0, 16) });
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Category Management State
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [catModal, setCatModal] = useState({ isOpen: false, parentId: null as string | null, name: '', icon: '📁' });
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Auth
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [email, setEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, []);

  const fetchNotes = useCallback(async () => {
    if (!session) return;
    try {
      const { data } = await db.getNotes();
      setNotes(data || []);
    } catch (err) {}
  }, [session]);

  const fetchCategories = useCallback(async () => {
    if (!session) return;
    try {
      let data = await db.getCategories();
      if (data && data.length === 0) {
        for (let i = 0; i < INITIAL_CATEGORIES.length; i++) {
          try { await db.insertCategory({ ...INITIAL_CATEGORIES[i], sort_order: i }); } catch (e) {}
        }
        data = await db.getCategories();
      }
      setCategories(data || INITIAL_CATEGORIES);
    } catch (err) {}
  }, [session]);

  useEffect(() => { if (session) { fetchNotes(); fetchCategories(); } }, [session, fetchNotes, fetchCategories]);

  const selectedNote = useMemo(() => notes.find(n => n.id === selectedNoteId) || null, [notes, selectedNoteId]);

  // Hierarchical category processing
  const hierarchicalCategories = useMemo(() => {
    const build = (parentId: string | null = null, depth = 0): any[] => {
      return categories
        .filter(c => c.parent_id === parentId)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .reduce((acc, cat) => {
          const hasChildren = categories.some(c => c.parent_id === cat.id);
          const isExpanded = !!expandedIds[cat.id] || isManagingCategories;
          const items = [{ ...cat, depth, hasChildren, isExpanded }];
          if (isExpanded) {
            items.push(...build(cat.id, depth + 1));
          }
          return [...acc, ...items];
        }, [] as any[]);
    };
    // Ensure "all" is always at the top if it's in the list
    const rootItems = build(null, 0);
    const allIdx = rootItems.findIndex(c => c.id === 'all');
    if (allIdx > 0) {
      const [all] = rootItems.splice(allIdx, 1);
      rootItems.unshift(all);
    }
    return rootItems;
  }, [categories, expandedIds, isManagingCategories]);

  // Indexing Function for Attachments
  const indexAttachments = useCallback(async (note: Note, password?: string) => {
    if (!note.attachments || note.attachments.length === 0) return;
    
    for (const path of note.attachments) {
      const filename = getFileNameFromPath(path);
      const ext = filename.split('.').pop()?.toLowerCase();
      
      // Fix: Detect mime type for proper decryption and rendering
      const mimeMap: Record<string, string> = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 
        'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
        'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown'
      };
      const mimeType = mimeMap[ext || ''] || 'application/octet-stream';
      
      // Handle Text Previews
      if (isTextFile(filename) && !attachmentTextCache[path]) {
        try {
          const blob = await db.downloadFile(path);
          let finalBlob = blob;
          if (note.is_encrypted && password) {
            finalBlob = await decryptFile(blob, password, mimeType);
          }
          const text = await finalBlob.text();
          setAttachmentTextCache(prev => ({ ...prev, [path]: text }));
        } catch (e) {
          console.warn(`Failed to index text ${filename}`, e);
        }
      } 
      // Handle Image Previews
      else if (isImageFile(filename) && !attachmentImageCache[path]) {
        try {
          const blob = await db.downloadFile(path);
          let finalBlob = blob;
          if (note.is_encrypted && password) {
            finalBlob = await decryptFile(blob, password, mimeType);
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            setAttachmentImageCache(prev => ({ ...prev, [path]: reader.result as string }));
          };
          reader.readAsDataURL(finalBlob);
        } catch (e) {
          console.warn(`Failed to index image ${filename}`, e);
        }
      }
    }
  }, [attachmentTextCache, attachmentImageCache]);

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      const catMatch = selectedCategory === 'all' || n.category === selectedCategory;
      const query = searchQuery.toLowerCase();
      if (!query) return catMatch;

      const cached = decryptedCache[n.id];
      const title = (cached?.title || n.title || '').toLowerCase();
      const content = (cached?.content || (n.is_encrypted ? '' : n.content) || '').toLowerCase();
      
      const inTitleOrContent = title.includes(query) || content.includes(query);
      
      // Search in Attachment Filenames
      const inFilenames = n.attachments?.some(path => getFileNameFromPath(path).toLowerCase().includes(query));
      
      // Search in Attachment Indexed Text
      const inAttachmentContent = n.attachments?.some(path => attachmentTextCache[path]?.toLowerCase().includes(query));

      return catMatch && (inTitleOrContent || inFilenames || inAttachmentContent);
    }).sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.field) {
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'title':
          const titleA = (decryptedCache[a.id]?.title || a.title || '').toLowerCase();
          const titleB = (decryptedCache[b.id]?.title || b.title || '').toLowerCase();
          comparison = titleA.localeCompare(titleB);
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
        case 'security':
          comparison = (a.is_encrypted === b.is_encrypted) ? 0 : a.is_encrypted ? 1 : -1;
          break;
        case 'attachments':
          const countA = a.attachments?.length || 0;
          const countB = b.attachments?.length || 0;
          comparison = countA - countB;
          break;
      }
      return sortConfig.order === 'desc' ? -comparison : comparison;
    });
  }, [notes, selectedCategory, searchQuery, decryptedCache, attachmentTextCache, sortConfig]);

  const handleSelectNote = (id: string) => {
    // Auto-lock when moving to another note
    setDecryptedCache({});
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    
    setSelectedNoteId(id);
    setIsCreating(false);
    setIsEditing(false);
    setUnlockPassword('');
    setStagedFiles([]);
    setMobileView('note'); // Mobile transition
    
    // Auto-index if not encrypted
    const note = notes.find(n => n.id === id);
    if (note && !note.is_encrypted) {
      indexAttachments(note);
    }
  };

  const handleUnlock = async () => {
    if (!selectedNote) return;
    try {
      const decContent = await decryptData(selectedNote.content, selectedNote.iv!, selectedNote.salt!, unlockPassword);
      setDecryptedCache(prev => ({ ...prev, [selectedNote.id]: { title: selectedNote.title, content: decContent } }));
      // Index attachments after unlocking
      indexAttachments(selectedNote, unlockPassword);
      
      // Auto-lock after 1 min
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        setDecryptedCache({});
        setUnlockPassword('');
        setIsEditing(false);
      }, 60000);
    } catch (err) { alert("Invalid key."); }
  };

  const processFileUploads = async (files: File[], isEncrypted: boolean, password?: string) => {
    const uploadedPaths: string[] = [];
    for (const file of files) {
      let fileToUpload: File | Blob = file;
      if (isEncrypted && password) {
        fileToUpload = await encryptFile(file, password);
      }
      const path = await db.uploadFile(fileToUpload, file.name);
      uploadedPaths.push(path);
    }
    return uploadedPaths;
  };

  const handleSaveNewNote = async () => {
    if (!newNote.title.trim()) return alert("Title required");
    if (newNote.encrypt && !newNote.password) return alert("Password required for encryption");
    
    setIsUploading(true);
    try {
      const attachmentPaths = await processFileUploads(stagedFiles, newNote.encrypt, newNote.password);
      let payload: any;
      const createdAt = new Date(newNote.date).toISOString();
      if (newNote.encrypt) {
        const contentEnc = await encryptData(newNote.content, newNote.password);
        payload = { 
          title: newNote.title, 
          content: contentEnc.ciphertext, 
          is_encrypted: true, 
          category: newNote.category, 
          iv: contentEnc.iv, 
          salt: contentEnc.salt,
          attachments: attachmentPaths,
          created_at: createdAt
        };
      } else {
        payload = { title: newNote.title, content: newNote.content, category: newNote.category, is_encrypted: false, attachments: attachmentPaths, created_at: createdAt };
      }
      await db.insertNote(payload);
      setNewNote({ title: '', content: '', encrypt: false, password: '', category: 'Personal', date: new Date().toISOString().slice(0, 16) });
      setStagedFiles([]);
      setIsCreating(false);
      fetchNotes();
      setMobileView('list'); // Return to list on mobile after creation
    } catch (err: any) { alert("Error saving: " + err.message); } finally { setIsUploading(false); }
  };

  const handleUpdateNote = async () => {
    if (!selectedNote) return;
    const pwd = editForm.password || unlockPassword;
    if (editForm.is_encrypted && !pwd) return alert("Password required to save encrypted note");

    setIsUploading(true);
    try {
      const newAttachmentPaths = await processFileUploads(stagedFiles, editForm.is_encrypted, pwd);
      const combinedAttachments = [...(selectedNote.attachments || []), ...newAttachmentPaths];
      const createdAt = new Date(editForm.date).toISOString();
      let payload: any = { title: editForm.title, category: editForm.category, is_encrypted: editForm.is_encrypted, attachments: combinedAttachments, created_at: createdAt };
      if (editForm.is_encrypted) {
        const contentEnc = await encryptData(editForm.content, pwd);
        payload.content = contentEnc.ciphertext; payload.iv = contentEnc.iv; payload.salt = contentEnc.salt;
      } else {
        payload.content = editForm.content; payload.iv = null; payload.salt = null;
      }
      await db.updateNote(selectedNote.id, payload);
      setStagedFiles([]); setIsEditing(false); fetchNotes();
    } catch (err: any) { alert("Error updating: " + err.message); } finally { setIsUploading(false); }
  };

  const handleDownloadAttachment = async (path: string) => {
    try {
      const blob = await db.downloadFile(path);
      const fileName = getFileNameFromPath(path);
      let finalBlob = blob;
      if (selectedNote?.is_encrypted) {
        if (!unlockPassword) return alert("Vault key required to decrypt file.");
        finalBlob = await decryptFile(blob, unlockPassword);
      }
      const url = window.URL.createObjectURL(finalBlob);
      const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err: any) { alert("Failed to download: " + err.message); }
  };

  const handleOpenPreview = async (path: string) => {
    try {
      const blob = await db.downloadFile(path);
      const fileName = getFileNameFromPath(path);
      const ext = fileName.split('.').pop()?.toLowerCase();
      
      // Fix: Detect correct mime type for proper modal rendering
      const mimeMap: Record<string, string> = {
        'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 
        'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
        'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown'
      };
      const mimeType = mimeMap[ext || ''] || 'application/octet-stream';

      let finalBlob = blob;
      if (selectedNote?.is_encrypted) {
        if (!unlockPassword) return alert("Vault key required to decrypt preview.");
        finalBlob = await decryptFile(blob, unlockPassword, mimeType);
      } else {
        finalBlob = new Blob([blob], { type: mimeType });
      }

      const type = finalBlob.type;
      const url = window.URL.createObjectURL(finalBlob);
      let textContent = '';
      if (isTextFile(fileName)) {
        textContent = await finalBlob.text();
      }
      setPreviewData({ url, name: fileName, type, text: textContent || undefined });
    } catch (err: any) { alert("Preview failed: " + err.message); }
  };

  const closePreview = () => {
    if (previewData?.url) window.URL.revokeObjectURL(previewData.url);
    setPreviewData(null);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthLoading(true);
    try {
      if (isSignUpMode) { await db.signUp(email, loginPassword); alert("Check email!"); }
      else { await db.signInWithPassword(email, loginPassword); }
    } catch (err: any) { alert(err.message); } finally { setAuthLoading(false); }
  };

  // --- Category Handlers ---
  const moveCategory = async (catId: string, direction: 'up' | 'down' | 'top' | 'bottom' | 'left' | 'right') => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    
    if (direction === 'left') {
      // Move to parent's parent (outdent)
      const parent = categories.find(c => c.id === cat.parent_id);
      const newParentId = parent ? parent.parent_id : null;
      try {
        await db.updateCategory(cat.id, { parent_id: newParentId, sort_order: 999 });
        fetchCategories();
      } catch (e) { console.error(e); }
      return;
    }

    if (direction === 'right') {
      // Move to sibling above's child (indent)
      const siblings = categories.filter(c => c.parent_id === cat.parent_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const sIdx = siblings.findIndex(s => s.id === catId);
      if (sIdx > 0) {
        const newParentId = siblings[sIdx - 1].id;
        try {
          await db.updateCategory(cat.id, { parent_id: newParentId, sort_order: 999 });
          fetchCategories();
        } catch (e) { console.error(e); }
      }
      return;
    }

    const siblings = categories.filter(c => c.parent_id === cat.parent_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const sIdx = siblings.findIndex(s => s.id === catId);
    let newSiblings = [...siblings];
    const [removed] = newSiblings.splice(sIdx, 1);

    if (direction === 'up') newSiblings.splice(Math.max(0, sIdx - 1), 0, removed);
    else if (direction === 'down') newSiblings.splice(Math.min(siblings.length - 1, sIdx + 1), 0, removed);
    else if (direction === 'top') newSiblings.splice(0, 0, removed);
    else if (direction === 'bottom') newSiblings.splice(newSiblings.length, 0, removed);

    const updatedSiblings = newSiblings.map((s, idx) => ({ ...s, sort_order: idx }));

    // Optimistic Update
    setCategories(prev => {
      const others = prev.filter(c => c.parent_id !== cat.parent_id);
      return [...others, ...updatedSiblings];
    });

    try {
      await Promise.all(updatedSiblings.map(s => db.updateCategory(s.id, { sort_order: s.sort_order })));
    } catch (err) {
      console.error("Failed to reorder:", err);
      fetchCategories(); // Rollback
    }
  };

  const handleCategoryDrop = async (targetId: string) => {
    if (!draggedCatId || draggedCatId === targetId) return;
    
    const sourceCat = categories.find(c => c.id === draggedCatId);
    if (!sourceCat) return;

    // Full rearrangement: dragging a category onto another makes it a subcategory
    // If target is 'all', move it to root level
    const newParentId = targetId === 'all' ? null : targetId;
    
    try {
      await db.updateCategory(draggedCatId, { parent_id: newParentId, sort_order: 999 });
      fetchCategories();
    } catch (err) {
      console.error("Failed to drop:", err);
      fetchCategories();
    }
    setDraggedCatId(null);
  };

  const handleAddCategory = (parentId: string | null = null) => {
    setCatModal({ isOpen: true, parentId, name: '', icon: '📁' });
  };

  const submitNewCategory = async () => {
    const { name, icon, parentId } = catModal;
    if (!name.trim()) return alert("Please enter a category name.");
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
    try {
      const siblings = categories.filter(c => c.parent_id === parentId);
      await db.insertCategory({ id, label: name, icon, sort_order: siblings.length, parent_id: parentId });
      setCatModal({ ...catModal, isOpen: false });
      fetchCategories();
    } catch (err: any) { alert(err.message); }
  };

  const handleUpdateCategory = async (id: string, label: string, icon: string) => {
    try {
      await db.updateCategory(id, { label, icon });
      fetchCategories();
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteCategory = async (id: string) => {
    if (id === 'all') return alert("Cannot delete 'All Notes'");
    if (!confirm("Are you sure? Notes in this category will not be deleted, but they will lose this tag.")) return;
    try {
      await db.deleteCategory(id);
      if (selectedCategory === id) setSelectedCategory('all');
      fetchCategories();
    } catch (err: any) { alert(err.message); }
  };

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCategoryClick = (id: string) => {
    setSelectedCategory(id);
    setMobileView('list');
    if (categories.some(c => c.parent_id === id)) {
      setExpandedIds(prev => ({ ...prev, [id]: true }));
    }
  };

  const FormattingToolbar = () => (
    <div className="flex flex-wrap items-center gap-1 mb-4 p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md sticky top-0 z-20">
      <button onMouseDown={e => { e.preventDefault(); execCommand('bold'); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors font-bold text-sm w-9 h-9 flex items-center justify-center" title="Bold">B</button>
      <button onMouseDown={e => { e.preventDefault(); execCommand('italic'); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors italic text-sm w-9 h-9 flex items-center justify-center" title="Italic">I</button>
      <button onMouseDown={e => { e.preventDefault(); execCommand('underline'); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors underline text-sm w-9 h-9 flex items-center justify-center" title="Underline">U</button>
      <button onMouseDown={e => { e.preventDefault(); execCommand('strikeThrough'); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors line-through text-sm w-9 h-9 flex items-center justify-center" title="Strikethrough">S</button>
      <div className="w-px h-4 bg-white/10 mx-1" />
      <div className="flex items-center gap-1 px-2 py-1 hover:bg-white/10 rounded-lg transition-colors relative group">
        <span className="text-[10px] font-black opacity-50">TEXT</span>
        <input type="color" onChange={e => execCommand('foreColor', e.target.value)} className="w-5 h-5 bg-transparent border-none p-0 cursor-pointer rounded overflow-hidden" defaultValue="#e0e0e0" title="Text Color" />
      </div>
      <div className="flex items-center gap-1 px-2 py-1 hover:bg-white/10 rounded-lg transition-colors relative group">
        <span className="text-[10px] font-black opacity-50">GLOW</span>
        <input type="color" onChange={e => execCommand('hiliteColor', e.target.value)} className="w-5 h-5 bg-transparent border-none p-0 cursor-pointer rounded overflow-hidden" defaultValue="#ffb340" title="Highlight Color" />
      </div>
      <div className="w-px h-4 bg-white/10 mx-1" />
      <button onMouseDown={e => { e.preventDefault(); execCommand('insertUnorderedList'); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-sm w-16 h-9 flex items-center justify-center gap-1" title="Bullet List"><span className="text-xs">•</span> List</button>
      <button onMouseDown={e => { e.preventDefault(); execCommand('formatBlock', 'h2'); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors font-black text-xs w-9 h-9 flex items-center justify-center" title="Heading">H</button>
      <button onMouseDown={e => { e.preventDefault(); execCommand('removeFormat'); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-xs w-9 h-9 flex items-center justify-center" title="Clear Formatting">⌫</button>
    </div>
  );

  if (isLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin" /></div>;

  if (!session) {
    return (
      <div className="min-h-screen flex bg-[#0a0414] text-white relative overflow-hidden font-sans selection:bg-amber-500/30">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-500/5 blur-[120px] rounded-full" />
        
        {/* Logo */}
        <div className="absolute top-10 left-10 flex items-center gap-3 z-20">
          <div className="w-10 h-10 bg-[#ffb143] rounded-xl flex items-center justify-center text-black font-black text-xl shadow-[0_0_20px_rgba(255,177,67,0.2)]">V</div>
          <span className="font-black text-2xl tracking-tighter">Vault</span>
        </div>

        <div className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 z-10 px-8 relative h-screen">
          {/* Left Side Content */}
          <div className="hidden lg:flex flex-col justify-center">
            <h1 className="text-[120px] font-black leading-[0.85] tracking-tighter mb-16 text-white drop-shadow-2xl">
              Secure.<br />Private.<br />Yours.
            </h1>
            <div className="space-y-12">
              <div className="flex items-center gap-5">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">🛡️</div>
                <div>
                  <h3 className="font-bold text-lg">Zero-Knowledge</h3>
                  <p className="text-white/40 text-sm">Military-grade AES-256 encryption happens locally. We never see your data.</p>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">☁️</div>
                <div>
                  <h3 className="font-bold text-lg">Instant SaaS Sync</h3>
                  <p className="text-white/40 text-sm">Access your notes across all devices with real-time encrypted cloud backup.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Login Card */}
          <div className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-[480px] bg-white/[0.04] backdrop-blur-3xl border border-white/[0.08] rounded-[48px] p-12 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
              <div className="mb-12">
                <h2 className="text-4xl font-black tracking-tight mb-2">{isSignUpMode ? 'Get Started' : 'Welcome Back'}</h2>
                <p className="text-white/40 font-medium text-sm">Please enter your details to continue.</p>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-8" autoComplete="off">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 ml-1">Identify</label>
                  <input 
                    type="email" 
                    placeholder="Enter your email" 
                    autoComplete="off"
                    className="w-full bg-[#ebf2ff]/90 border-none rounded-2xl py-5 px-6 text-[#0a0414] font-medium outline-none placeholder:text-zinc-400 transition-all focus:ring-2 focus:ring-amber-500/20" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 ml-1">Secret Key</label>
                  <input 
                    type="text" 
                    placeholder="Enter password" 
                    autoComplete="off"
                    spellCheck={false}
                    className="secure-input-field w-full bg-[#ebf2ff]/90 border-none rounded-2xl py-5 px-6 text-[#0a0414] font-medium outline-none placeholder:text-zinc-400 transition-all focus:ring-2 focus:ring-amber-500/20" 
                    value={loginPassword} 
                    onChange={e => setLoginPassword(e.target.value)} 
                    required 
                  />
                </div>
                
                <button 
                  disabled={authLoading} 
                  className="w-full bg-[#ffb143] hover:bg-[#ffba5a] text-black font-black py-5 rounded-2xl transition-all disabled:opacity-50 shadow-[0_12px_30px_rgba(255,177,67,0.2)] flex items-center justify-center gap-2 group"
                >
                  {authLoading ? 'Verifying...' : (isSignUpMode ? 'Join Vault →' : 'Enter Vault →')}
                </button>
              </form>

              <div className="mt-12 text-center">
                <p className="text-zinc-500 text-[11px] font-bold uppercase mb-2">Don't have access yet?</p>
                <button 
                  onClick={() => setIsSignUpMode(!isSignUpMode)} 
                  className="text-white hover:text-amber-500 font-black text-sm uppercase tracking-widest transition-colors"
                >
                  {isSignUpMode ? 'Log In Instead' : 'Request Access'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Global Footer Elements */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 lg:left-10 lg:translate-x-0 flex flex-wrap justify-center lg:justify-start items-center gap-4 lg:gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-white/20 w-full lg:w-auto px-6 lg:px-0 z-20">
          <span>Privacy Focused</span>
          <span>Zero Knowledge</span>
          <span>AES-256</span>
          <span className="text-amber-500/40">© {new Date().getFullYear()} TM Loum</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#050505] text-[#e0e0e0] font-sans overflow-hidden">
      {/* Sidebar - Categories */}
      <aside className={`${mobileView === 'categories' ? 'flex' : 'hidden'} md:flex w-full md:w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl flex-col shrink-0 z-30`}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-black font-black">V</div>
            <span className="font-black text-xl tracking-tight">Vault</span>
          </div>
          <button 
            onClick={() => setIsManagingCategories(!isManagingCategories)} 
            className={`text-[10px] font-black uppercase px-2 py-1 rounded-md transition-all ${isManagingCategories ? 'bg-amber-500 text-black' : 'text-zinc-600 hover:text-white'}`}
          >
            {isManagingCategories ? 'Done' : 'Edit'}
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
          {hierarchicalCategories.map((cat, idx) => (
            <div key={cat.id} className="group relative">
              {isManagingCategories ? (
                <div 
                  className={`flex items-center gap-1.5 p-2 bg-white/5 rounded-xl border mb-1 animate-in slide-in-from-left-2 relative cursor-move ${draggedCatId === cat.id ? 'opacity-20' : 'opacity-100 border-white/5 hover:border-amber-500/30'}`}
                  style={{ marginLeft: `${cat.depth * 12}px` }}
                  draggable={true}
                  onDragStart={() => setDraggedCatId(cat.id)}
                  onDragEnd={() => setDraggedCatId(null)}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-amber-500'); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('border-amber-500'); }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-amber-500'); handleCategoryDrop(cat.id); }}
                >
                  {cat.depth > 0 && <div className="absolute left-[-6px] top-0 bottom-0 w-px bg-white/10" />}
                  <input 
                    type="text" 
                    defaultValue={cat.icon} 
                    autoComplete="off"
                    className="w-8 bg-black/40 border-none text-center rounded-lg text-sm p-1 outline-none"
                    onBlur={(e) => handleUpdateCategory(cat.id, cat.label, e.target.value)}
                  />
                  <input 
                    type="text" 
                    defaultValue={cat.label} 
                    autoComplete="off"
                    className="flex-1 min-w-0 bg-transparent border-none text-[10px] font-bold outline-none"
                    onBlur={(e) => handleUpdateCategory(cat.id, e.target.value, cat.icon)}
                  />
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button onClick={() => moveCategory(cat.id, 'top')} className="text-[8px] opacity-20 hover:opacity-100" title="To Top">⤒</button>
                    <div className="flex gap-1">
                       <button onClick={() => moveCategory(cat.id, 'left')} className="text-[8px] opacity-30 hover:opacity-100" title="Outdent (Move to Root)">⇠</button>
                       <button onClick={() => moveCategory(cat.id, 'up')} className="text-[8px] opacity-30 hover:opacity-100">▲</button>
                       <button onClick={() => moveCategory(cat.id, 'down')} className="text-[8px] opacity-30 hover:opacity-100">▼</button>
                       <button onClick={() => moveCategory(cat.id, 'right')} className="text-[8px] opacity-30 hover:opacity-100" title="Indent (Subcategory)">⇢</button>
                    </div>
                    <button onClick={() => moveCategory(cat.id, 'bottom')} className="text-[8px] opacity-20 hover:opacity-100" title="To Bottom">⤓</button>
                  </div>
                  <button 
                    onClick={() => handleAddCategory(cat.id)} 
                    className="text-[8px] font-black uppercase bg-white/5 px-1 rounded hover:bg-amber-500 hover:text-black transition-colors"
                    title="Add Subcategory"
                  >
                    +Sub
                  </button>
                  {cat.id !== 'all' && (
                    <button onClick={() => handleDeleteCategory(cat.id)} className="text-[10px] text-red-500/50 hover:text-red-500 transition-colors ml-1 shrink-0">✕</button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {cat.hasChildren && (
                    <button 
                      onClick={(e) => toggleExpand(e, cat.id)} 
                      className={`text-[8px] transition-transform duration-200 opacity-40 hover:opacity-100 ${cat.isExpanded ? 'rotate-90' : ''}`}
                    >
                      ▶
                    </button>
                  )}
                  {!cat.hasChildren && cat.depth > 0 && <div className="w-[10px]" />}
                  <button 
                    onClick={() => handleCategoryClick(cat.id)} 
                    className={`flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm font-medium ${selectedCategory === cat.id ? 'bg-white/10 text-[#ffb340]' : 'text-zinc-500 hover:bg-white/5 hover:text-white'}`}
                    style={{ paddingLeft: `${cat.depth * 12 + 16}px` }}
                  >
                    <span className="text-base">{cat.icon}</span> {cat.label}
                  </button>
                </div>
              )}
            </div>
          ))}
          {isManagingCategories && (
            <button onClick={() => handleAddCategory(null)} className="w-full py-2.5 border-2 border-dashed border-white/5 rounded-xl text-[10px] font-black uppercase text-zinc-700 hover:text-zinc-500 hover:border-white/10 transition-all mt-2">
              + New Root Category
            </button>
          )}
        </nav>
        {/* Mobile Sidebar Close (Go back to list) */}
        <div className="md:hidden p-4">
           <button onClick={() => setMobileView('list')} className="w-full py-2.5 bg-white/5 rounded-xl text-xs font-black uppercase text-zinc-400">Close Menu</button>
        </div>
        <div className="p-4 border-t border-white/5"><button onClick={() => db.signOut()} className="w-full py-2.5 text-xs font-black uppercase text-zinc-600 hover:text-zinc-400">Sign Out</button></div>
      </aside>

      {/* Note List */}
      <section className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-[350px] border-r border-white/5 bg-[#0a0a0a] flex-col shrink-0 z-20`}>
        <div className="p-6 pb-4">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
               <button onClick={() => setMobileView('categories')} className="md:hidden text-zinc-400 hover:text-white">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
               </button>
               <h2 className="text-2xl font-black tracking-tight">{categories.find(c => c.id === selectedCategory)?.label || 'Notes'}</h2>
            </div>
            <button onClick={() => { setIsCreating(true); setSelectedNoteId(null); setStagedFiles([]); setMobileView('note'); }} className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 active:scale-95 group">
              <svg className="w-4 h-4 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              <span>New Note</span>
            </button>
          </div>
          
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              <input 
                type="text" placeholder="Deep search..." 
                autoComplete="off"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm focus:border-amber-500/50 outline-none transition-all placeholder-zinc-700"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="absolute left-3 top-2.5 text-zinc-600 text-xs">🔍</span>
            </div>
            
            <div className="relative" ref={sortDropdownRef}>
              <button 
                onClick={() => setIsSortOpen(!isSortOpen)}
                className={`p-2.5 rounded-xl border transition-all ${isSortOpen ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}
                title="Sort Notes"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              </button>

              {isSortOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-[#121212]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-600">Sort Workspace By</div>
                  <div className="mt-1 space-y-0.5">
                    {SORT_OPTIONS.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setSortConfig(opt); setIsSortOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all hover:bg-white/5 ${sortConfig.label === opt.label ? 'text-amber-400 bg-amber-500/5' : 'text-zinc-400 hover:text-zinc-100'}`}
                      >
                        <span className="text-lg w-6 flex justify-center">{opt.icon}</span>
                        <span className="flex-1 text-left font-medium">{opt.label}</span>
                        {sortConfig.label === opt.label && <span className="text-[10px] font-black uppercase text-amber-500">Active</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredNotes.length === 0 ? (
            <div className="p-10 text-center text-zinc-600 text-sm italic">No entries match your search</div>
          ) : (
            filteredNotes.map(note => {
              const isSelected = selectedNoteId === note.id;
              const cached = decryptedCache[note.id];
              const title = cached?.title || note.title || 'Untitled';
              const rawPreview = stripHtml(cached?.content || (note.is_encrypted ? 'Encrypted Content' : note.content));
              const preview = rawPreview || (note.is_encrypted ? 'Encrypted Content' : 'Empty note');

              const queryLower = searchQuery.toLowerCase();
              const matchedInAttachments = searchQuery && note.attachments?.some(p => {
                const name = getFileNameFromPath(p).toLowerCase();
                const text = attachmentTextCache[p]?.toLowerCase() || '';
                return name.includes(queryLower) || text.includes(queryLower);
              });

              return (
                <div 
                  key={note.id} 
                  onClick={() => handleSelectNote(note.id)}
                  className={`px-6 py-5 border-b border-white/5 cursor-pointer transition-all ${isSelected ? 'bg-amber-500/10' : 'hover:bg-white/5'}`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <h3 className={`font-bold truncate pr-4 text-sm transition-colors ${isSelected ? 'text-amber-400' : 'text-zinc-200'}`}>{title}</h3>
                    <span className="text-[9px] text-zinc-600 font-bold uppercase shrink-0 mt-0.5">{formatRelativeTime(note.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed opacity-60 italic">{preview}</p>
                  
                  {matchedInAttachments && (
                    <div className="mt-2 text-[9px] font-black uppercase text-amber-500/60 flex items-center gap-1.5">
                      <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" />
                      Match in attachments
                    </div>
                  )}

                  <div className="mt-3 flex gap-4 items-center">
                    <div className="flex items-center gap-2.5">
                      {note.is_encrypted && (
                        <span className={`text-[10px] transition-all ${isSelected ? 'text-amber-400' : 'opacity-30'}`} title="Protected">🔒</span>
                      )}
                      {note.attachments && note.attachments.length > 0 && (
                        <span className={`text-[10px] transition-all flex items-center gap-1 ${isSelected ? 'text-amber-400' : 'opacity-30'}`} title={`${note.attachments.length} Files`}>
                          📎 <span className="text-[8px] font-black">{note.attachments.length}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex-1" />
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${isSelected ? 'border-amber-500/40 text-amber-500' : 'border-white/5 text-zinc-700'}`}>
                      {note.category}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Note Content / Creation Area */}
      <main className={`${mobileView === 'note' ? 'block' : 'hidden'} md:block flex-1 bg-[#050505] relative overflow-hidden z-10`}>
        {isCreating ? (
          <div className="h-full flex flex-col max-w-4xl mx-auto p-6 md:p-12 animate-in fade-in duration-500">
            {/* Mobile Header for New Note */}
            <div className="md:hidden flex items-center mb-6">
               <button onClick={() => { setIsCreating(false); setMobileView('list'); }} className="text-zinc-400 flex items-center gap-2 font-bold text-sm">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                 Cancel
               </button>
            </div>
            <input 
              autoFocus placeholder="Untitled Note"
              autoComplete="off"
              className="text-4xl md:text-6xl font-black bg-transparent border-none outline-none mb-4 md:mb-8 placeholder-zinc-800 tracking-tighter"
              value={newNote.title} onChange={e => setNewNote({...newNote, title: e.target.value})}
            />
            
            <FormattingToolbar />

            <div 
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onInput={e => setNewNote({...newNote, content: e.currentTarget.innerHTML})}
              data-placeholder="Start writing..."
              className="flex-1 text-lg md:text-xl leading-relaxed bg-transparent border-none outline-none resize-none placeholder-zinc-900 custom-scrollbar min-h-[200px] overflow-y-auto rich-text-content"
            />
            
            {stagedFiles.length > 0 && (
              <div className="mb-6 p-4 md:p-5 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-md">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  Staged for Upload ({stagedFiles.length})
                </h4>
                <div className="flex flex-wrap gap-2.5">
                  {stagedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-xl text-xs border border-white/10 group hover:border-amber-500/40 transition-colors">
                      <span className="text-zinc-400">📄</span>
                      <span className="truncate max-w-[150px] font-medium">{f.name}</span>
                      <button onClick={() => setStagedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-red-400 transition-colors ml-1">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center py-6 md:py-10 border-t border-white/5 gap-6">
              <div className="flex flex-wrap gap-4 items-center justify-center">
                <button onClick={() => setNewNote({...newNote, encrypt: !newNote.encrypt})} className={`text-2xl transition-all duration-300 ${newNote.encrypt ? 'opacity-100 scale-125 drop-shadow-[0_0_8px_rgba(255,179,64,0.4)]' : 'opacity-20 hover:opacity-40'}`} title="Local AES-256 Encryption">🔒</button>
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => e.target.files && setStagedFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors" title="Attach Secure Files">📎</button>
                {newNote.encrypt && (
                  <input 
                    type="text" 
                    placeholder="Vault Access Key" 
                    autoComplete="off" 
                    spellCheck={false}
                    className="secure-input-field bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none w-full md:w-56 focus:border-amber-500/50 transition-all" 
                    value={newNote.password} 
                    onChange={e => setNewNote({...newNote, password: e.target.value})} 
                  />
                )}
                <select className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none cursor-pointer font-bold uppercase tracking-wider text-zinc-500" value={newNote.category} onChange={e => setNewNote({...newNote, category: e.target.value})}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <input type="datetime-local" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-amber-500/50 transition-all text-zinc-400" value={newNote.date} onChange={e => setNewNote({...newNote, date: e.target.value})} />
              </div>
              <div className="flex gap-6 items-center w-full md:w-auto">
                <button onClick={() => { setIsCreating(false); setMobileView('list'); }} className="hidden md:block text-zinc-600 font-bold hover:text-zinc-400 transition-colors">Discard</button>
                <button onClick={handleSaveNewNote} disabled={isUploading} className="flex-1 md:flex-none bg-amber-500 text-black px-12 py-3.5 rounded-full font-black shadow-2xl shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                  {isUploading ? 'Securing...' : 'Seal Note'}
                </button>
              </div>
            </div>
          </div>
        ) : selectedNote ? (
          <div className="h-full flex flex-col max-w-4xl mx-auto p-6 md:p-12">
            {selectedNote.is_encrypted && !decryptedCache[selectedNote.id] ? (
              <div className="h-full flex flex-col items-center justify-center gap-10 animate-in fade-in duration-700">
                <button onClick={() => setMobileView('list')} className="md:hidden absolute top-6 left-6 text-zinc-400 font-bold text-sm flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </button>
                <div className="text-[80px] md:text-[120px] leading-none opacity-5 animate-pulse">🔒</div>
                <div className="text-center space-y-4">
                  <h3 className="text-3xl md:text-4xl font-black tracking-tighter">Vault Protected</h3>
                  <p className="text-zinc-500 max-w-xs md:max-w-sm mx-auto font-medium text-sm md:text-base">This entry is locally encrypted with AES-256-GCM. We do not have your key.</p>
                </div>
                <div className="flex flex-col gap-4 w-full max-w-md">
                  <input 
                    type="text" placeholder="Enter Access Key" autoFocus 
                    autoComplete="off"
                    spellCheck={false}
                    className="secure-input-field w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-center text-xl outline-none focus:border-amber-500/50 transition-all placeholder-white/10" 
                    value={unlockPassword} onChange={e => setUnlockPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUnlock()} 
                  />
                  <button onClick={handleUnlock} className="w-full bg-amber-500 text-black py-4 rounded-2xl font-black text-lg transition-all hover:bg-amber-400 shadow-xl shadow-amber-500/10">Unlock Identity</button>
                </div>
              </div>
            ) : isEditing ? (
              <div className="h-full flex flex-col max-w-4xl mx-auto p-6 md:p-12 animate-in fade-in duration-500">
                <div className="md:hidden flex items-center mb-6">
                   <button onClick={() => setIsEditing(false)} className="text-zinc-400 flex items-center gap-2 font-bold text-sm">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                     Cancel
                   </button>
                </div>
                <input 
                  autoFocus placeholder="Untitled Note"
                  autoComplete="off"
                  className="text-4xl md:text-6xl font-black bg-transparent border-none outline-none mb-4 md:mb-8 placeholder-zinc-800 tracking-tighter"
                  value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})}
                />
                
                <FormattingToolbar />

                <div 
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  onInput={e => setEditForm({...editForm, content: e.currentTarget.innerHTML})}
                  dangerouslySetInnerHTML={{ __html: editForm.content }}
                  data-placeholder="Start writing..."
                  className="flex-1 text-lg md:text-xl leading-relaxed bg-transparent border-none outline-none resize-none placeholder-zinc-900 custom-scrollbar min-h-[200px] overflow-y-auto rich-text-content"
                />
                
                {stagedFiles.length > 0 && (
                  <div className="mb-6 p-4 md:p-5 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-md">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                      Staged for Update ({stagedFiles.length})
                    </h4>
                    <div className="flex flex-wrap gap-2.5">
                      {stagedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-xl text-xs border border-white/10 group hover:border-amber-500/40 transition-colors">
                          <span className="text-zinc-400">📄</span>
                          <span className="truncate max-w-[150px] font-medium">{f.name}</span>
                          <button onClick={() => setStagedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-red-400 transition-colors ml-1">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col md:flex-row justify-between items-center py-6 md:py-10 border-t border-white/5 gap-6">
                  <div className="flex flex-wrap gap-4 items-center justify-center">
                    <button onClick={() => setEditForm({...editForm, is_encrypted: !editForm.is_encrypted})} className={`text-2xl transition-all duration-300 ${editForm.is_encrypted ? 'opacity-100 scale-125 drop-shadow-[0_0_8px_rgba(255,179,64,0.4)]' : 'opacity-20 hover:opacity-40'}`} title="Local AES-256 Encryption">🔒</button>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => e.target.files && setStagedFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors" title="Attach Secure Files">📎</button>
                    {editForm.is_encrypted && (
                      <input 
                        type="text" 
                        placeholder="Vault Access Key" 
                        autoComplete="off" 
                        spellCheck={false}
                        className="secure-input-field bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none w-full md:w-56 focus:border-amber-500/50 transition-all" 
                        value={editForm.password} 
                        onChange={e => setEditForm({...editForm, password: e.target.value})} 
                      />
                    )}
                    <select className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none cursor-pointer font-bold uppercase tracking-wider text-zinc-500" value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})}>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <input type="datetime-local" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-amber-500/50 transition-all text-zinc-400" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} />
                  </div>
                  <div className="flex gap-6 items-center w-full md:w-auto">
                    <button onClick={() => setIsEditing(false)} className="hidden md:block text-zinc-600 font-bold hover:text-zinc-400 transition-colors">Cancel</button>
                    <button onClick={handleUpdateNote} disabled={isUploading} className="flex-1 md:flex-none bg-amber-500 text-black px-12 py-3.5 rounded-full font-black shadow-2xl shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                      {isUploading ? 'Updating...' : 'Update Note'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col animate-in slide-in-from-bottom-8 duration-500">
                {/* Mobile Back Button */}
                <div className="md:hidden flex items-center mb-6">
                   <button onClick={() => { setSelectedNoteId(null); setMobileView('list'); }} className="text-zinc-400 flex items-center gap-2 font-bold text-sm">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                     Back
                   </button>
                </div>
                <div className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-12 gap-4">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-4xl md:text-7xl font-black mb-4 md:mb-6 tracking-tighter leading-tight break-words">{decryptedCache[selectedNote.id]?.title || selectedNote.title}</h1>
                    <div className="flex flex-wrap gap-4 md:gap-6 items-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
                      <span className="flex items-center gap-2 shrink-0">📅 {formatRelativeTime(selectedNote.created_at)}</span>
                      <span className="hidden md:block w-1 h-1 bg-white/10 rounded-full" />
                      <span className="text-amber-500/80 bg-amber-500/5 px-3 py-1 rounded-full border border-amber-500/10 shrink-0">{selectedNote.category}</span>
                    </div>
                  </div>
                  <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={() => { setEditForm({ title: decryptedCache[selectedNote.id]?.title || selectedNote.title, content: decryptedCache[selectedNote.id]?.content || selectedNote.content, category: selectedNote.category, is_encrypted: selectedNote.is_encrypted, password: '', date: selectedNote.created_at.slice(0, 16) }); setStagedFiles([]); setIsEditing(true); }} className="flex-1 md:flex-none p-3 md:p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-center" title="Edit Entry">✎</button>
                    <button onClick={() => confirm("Delete this secure entry permanently?") && db.deleteNote(selectedNote.id).then(() => { setSelectedNoteId(null); fetchNotes(); setMobileView('list'); })} className="flex-1 md:flex-none p-3 md:p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-red-500/20 text-red-500 transition-all text-center" title="Wipe Note">🗑️</button>
                  </div>
                </div>
                
                <div 
                  className="flex-1 text-xl md:text-2xl leading-[1.6] text-zinc-300 custom-scrollbar overflow-y-auto font-medium selection:bg-amber-500/30 rich-text-content"
                  spellCheck={false}
                  dangerouslySetInnerHTML={{ __html: decryptedCache[selectedNote.id]?.content || selectedNote.content }}
                />

                {selectedNote.attachments && selectedNote.attachments.length > 0 && (
                  <div className="mt-8 md:mt-12 pt-6 md:pt-10 border-t border-white/5">
                    <div className="flex justify-between items-end mb-6">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-3">
                        <span className="text-xl">📎</span>
                        Attachments ({selectedNote.attachments.length})
                      </h4>
                      <span className="hidden sm:inline-block text-[9px] font-black uppercase text-zinc-700 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                        {selectedNote.is_encrypted ? 'Encrypted Local Index' : 'Standard View'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedNote.attachments.map((path, idx) => {
                        const filename = getFileNameFromPath(path);
                        const isText = isTextFile(filename);
                        const isImage = isImageFile(filename);
                        const isPdf = isPdfFile(filename);
                        const isIndexed = !!attachmentTextCache[path] || !!attachmentImageCache[path];
                        
                        return (
                          <div key={idx} className="flex flex-col p-2 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-amber-500/30 transition-all text-left group relative overflow-hidden">
                            {/* Preview Area */}
                            {isImage && attachmentImageCache[path] && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-black/20 border border-white/5">
                                <img src={attachmentImageCache[path]} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="Preview" />
                              </div>
                            )}
                            {isText && attachmentTextCache[path] && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-black/40 border border-white/5 p-3 text-[9px] font-mono text-zinc-500 opacity-80 leading-tight custom-scrollbar overflow-y-auto whitespace-pre-wrap">
                                {attachmentTextCache[path].slice(0, 500)}
                                {attachmentTextCache[path].length > 500 && '...'}
                              </div>
                            )}
                            {isPdf && (
                              <div className="w-full h-32 mb-2 rounded-2xl overflow-hidden bg-red-500/5 border border-white/5 flex items-center justify-center">
                                <span className="text-4xl">📄</span>
                                <span className="absolute text-[8px] font-black uppercase text-red-500">PDF Document</span>
                              </div>
                            )}

                            <div className="flex items-center gap-4 p-3 relative min-w-0">
                              <div className="relative shrink-0">
                                <span className="text-3xl group-hover:scale-110 transition-transform duration-500 block">
                                  {isText ? '📝' : isImage ? '🖼️' : isPdf ? '📄' : '📦'}
                                </span>
                                {isIndexed && (
                                  <span className="absolute -bottom-1 -right-1 text-[8px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded font-black">PREVIEW</span>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-sm font-bold truncate pr-4 text-zinc-200">{filename}</span>
                                <span className="text-[9px] text-zinc-600 uppercase font-black tracking-tighter flex items-center gap-1">
                                  {filename.split('.').pop()} {isIndexed ? '• Ready' : ''}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2 mt-2 pt-2 border-t border-white/5 p-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleOpenPreview(path); }} 
                                className="flex-1 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-[9px] font-black uppercase rounded-lg transition-all"
                              >
                                View
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDownloadAttachment(path); }} 
                                className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 text-[9px] font-black uppercase rounded-lg transition-all"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-10 pointer-events-none grayscale px-6">
            <div className="w-32 h-32 md:w-48 md:h-48 bg-white/10 rounded-[64px] flex items-center justify-center text-6xl md:text-8xl mb-12 animate-float">📜</div>
            <div className="text-center space-y-2">
              <p className="text-xl md:text-2xl font-black italic tracking-tighter">"Omnia mea mecum porto"</p>
              <p className="text-[10px] uppercase tracking-[0.4em] font-medium">All that is mine I carry with me</p>
            </div>
          </div>
        )}
      </main>

      {/* Attachment Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[150] flex flex-col items-center justify-center p-4 md:p-10 animate-in fade-in duration-300">
           <div className="w-full max-w-7xl flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                 <div className="flex flex-col">
                    <h3 className="text-xl font-black tracking-tight text-white">{previewData.name}</h3>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{previewData.type} • Secure Decrypted Stream</span>
                 </div>
                 <div className="flex gap-4">
                    <button onClick={() => {
                        const a = document.createElement('a');
                        a.href = previewData.url;
                        a.download = previewData.name;
                        a.click();
                    }} className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Save File</button>
                    <button onClick={closePreview} className="w-12 h-12 flex items-center justify-center bg-amber-500 text-black rounded-xl font-black text-xl hover:scale-110 transition-all shadow-xl shadow-amber-500/20">✕</button>
                 </div>
              </div>
              
              <div className="flex-1 bg-black/40 rounded-[32px] border border-white/5 overflow-hidden flex items-center justify-center shadow-2xl relative">
                 {previewData.type.startsWith('image/') ? (
                    <img src={previewData.url} className="max-w-full max-h-full object-contain animate-in zoom-in-95 duration-500" alt="Preview" />
                 ) : previewData.type === 'application/pdf' ? (
                    <iframe src={previewData.url} className="w-full h-full border-none" title="PDF Preview" />
                 ) : previewData.text ? (
                    <div className="w-full h-full p-8 md:p-12 overflow-y-auto custom-scrollbar font-mono text-sm md:text-base leading-relaxed text-zinc-400 whitespace-pre-wrap selection:bg-amber-500/30">
                       {previewData.text}
                    </div>
                 ) : (
                    <div className="text-center space-y-4">
                       <span className="text-6xl">📦</span>
                       <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">No direct preview available for this file type.</p>
                       <button onClick={() => window.open(previewData.url)} className="text-amber-500 underline text-sm font-black">Try opening in new tab</button>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Category Creation Modal */}
      {catModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#121212] border border-white/10 rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black tracking-tight">New Category</h3>
              <button onClick={() => setCatModal({ ...catModal, isOpen: false })} className="text-zinc-500 hover:text-white transition-colors">✕</button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-2 ml-1">Category Identity</label>
                <input 
                  type="text" 
                  placeholder="e.g. Finance, Travel, Work..." 
                  autoComplete="off"
                  className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-5 text-sm outline-none focus:border-amber-500/50 transition-all"
                  value={catModal.name}
                  onChange={e => setCatModal({ ...catModal, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-2 ml-1">Select Icon</label>
                <div className="grid grid-cols-6 gap-2 p-3 bg-white/5 rounded-2xl max-h-[180px] overflow-y-auto custom-scrollbar">
                  {COMMON_ICONS.map(icon => (
                    <button 
                      key={icon}
                      onClick={() => setCatModal({ ...catModal, icon })}
                      className={`text-xl p-2 rounded-xl transition-all ${catModal.icon === icon ? 'bg-amber-500/20 border border-amber-500/40' : 'hover:bg-white/5 border border-transparent'}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setCatModal({ ...catModal, isOpen: false })}
                  className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={submitNewCategory}
                  className="flex-1 bg-amber-500 text-black py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-amber-500/10"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .rich-text-content { color: #e0e0e0; }
        .rich-text-content a { color: #fbbf24; text-decoration: underline; font-weight: 700; }
        .rich-text-content img { max-width: 100%; height: auto; border-radius: 1rem; margin: 1rem 0; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
        .rich-text-content ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .rich-text-content ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
        .rich-text-content p { margin-bottom: 1rem; }
        .rich-text-content h1, .rich-text-content h2, .rich-text-content h3 { font-weight: 900; margin-top: 1.5rem; margin-bottom: 1rem; }
        
        /* Secure Input Masking */
        .secure-input-field {
          -webkit-text-security: disc;
          text-security: disc;
        }

        /* Fix for pasted black text visibility */
        .rich-text-content [style*="color: rgb(0, 0, 0)"],
        .rich-text-content [style*="color: #000000"],
        .rich-text-content [style*="color: #000"],
        .rich-text-content [style*="color: black"],
        .rich-text-content font[color="#000000"],
        .rich-text-content font[color="black"] {
          color: inherit !important;
        }

        [contentEditable]:empty:before {
          content: attr(data-placeholder);
          color: #3f3f46;
          pointer-events: none;
          display: block; /* For Firefox */
        }
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type="color"]::-webkit-color-swatch { border: none; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default App;
