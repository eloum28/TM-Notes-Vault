import { supabase } from './supabaseClient';

// --- STORAGE CONFIGURATION ---
const PRIMARY_BUCKET = 'attachments';
const LEGACY_BUCKET = 'vault_files';

export const db = {
  // --- AUTH ---
  signInWithMagicLink: async (email: string) => { return supabase.auth.signInWithOtp({ email }); },
  signInWithPassword: async (email: string, password: string) => { return supabase.auth.signInWithPassword({ email, password }); },
  signUp: async (email: string, password: string) => { return supabase.auth.signUp({ email, password }); },
  signOut: async () => { return supabase.auth.signOut(); },
  
  // --- NOTES ---
  getNotes: async () => {
    const { data, error } = await supabase.from('notes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    const mappedData = data.map((n: any) => ({ 
      ...n, 
      content: n.ciphertext || n.content || '',
      title: n.title || 'Untitled Note',
      category: n.category || 'Personal',
      created_at: n.created_at || new Date().toISOString()
    }));
    
    return { data: mappedData, error: null };
  },
  insertNote: async (note: any) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("You must be logged in to save.");

    const dbPayload = {
      title: note.title, 
      ciphertext: note.content, 
      is_encrypted: note.is_encrypted,
      category: note.category, 
      attachments: note.attachments, 
      iv: note.iv, 
      title_iv: note.title_iv, 
      salt: note.salt,
      user_id: user.id,
      created_at: note.created_at || new Date().toISOString()
    };
    const { error } = await supabase.from('notes').insert([dbPayload]);
    if (error) throw error;
  },
  
  updateNote: async (id: string, updates: any) => {
    const dbPayload: any = { ...updates };
    if (updates.content) {
      dbPayload.ciphertext = updates.content;
      delete dbPayload.content;
    }
    const { error } = await supabase.from('notes').update(dbPayload).eq('id', id);
    if (error) throw error;
  },

  deleteNote: async (id: string) => { 
    const { error, data } = await supabase.from('notes').delete().eq('id', id).select();
    if (error) throw error;
    if (data.length === 0) {
      throw new Error("Permission Denied: You cannot delete this note.");
    }
  },

  deleteNotes: async (ids: string[]) => {
    const { error, data } = await supabase.from('notes').delete().in('id', ids).select();
    if (error) throw error;
    return data;
  },

  // --- CATEGORIES ---
  getCategories: async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (error) {
      console.warn("Categories fetch error:", error.message);
      return [];
    }
    return data || [];
  },

  insertCategory: async (category: { id: string, label: string, icon: string, sort_order?: number, parent_id?: string | null }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    
    const { error } = await supabase.from('categories').insert([{
      id: category.id,
      label: category.label,
      icon: category.icon,
      sort_order: category.sort_order || 0,
      user_id: user.id,
      parent_id: category.parent_id
    }]);
    
    if (error) {
      if (error.code === '22P02') {
        throw new Error("Database error: The 'id' column in your 'categories' table must be type 'text', not 'uuid'. Please run the updated SQL in Supabase.");
      }
      throw error;
    }
  },

  updateCategory: async (id: string, updates: { label?: string, icon?: string, sort_order?: number, parent_id?: string | null }) => {
    const { error } = await supabase.from('categories').update(updates).eq('id', id);
    if (error) throw error;
  },

  deleteCategory: async (id: string) => {
    if (id === 'all') throw new Error("Cannot delete protected root category.");
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Unlink any notes currently assigned to this category
    const { error: noteUnlinkError } = await supabase
      .from('notes')
      .update({ category: 'all' })
      .eq('category', id)
      .eq('user_id', user.id);
    
    if (noteUnlinkError) console.warn("Note unlinking failed, might be no notes or no FK:", noteUnlinkError.message);

    // 2. Unlink any subcategories so they don't block deletion
    const { error: unlinkError } = await supabase
      .from('categories')
      .update({ parent_id: null })
      .eq('parent_id', id)
      .eq('user_id', user.id);
    
    if (unlinkError) throw unlinkError;

    // 3. Perform the deletion
    const { error, data } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Category not found or permission denied.");
    }
  },
  
  // --- FILES ---
  uploadFile: async (file: File | Blob, fileName: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("User not found");
    const filePath = `${user.id}/${Date.now()}_${fileName}`;
    const { data, error } = await supabase.storage.from(PRIMARY_BUCKET).upload(filePath, file, { contentType: 'application/octet-stream' });
    if (error) throw error;
    return data.path; 
  },

  downloadFile: async (path: string) => {
    let result = await supabase.storage.from(PRIMARY_BUCKET).download(path);
    if (result.error && result.error.message.includes('Object not found')) {
      const legacyResult = await supabase.storage.from(LEGACY_BUCKET).download(path);
      if (!legacyResult.error) return legacyResult.data;
    }
    if (result.error) throw result.error;
    return result.data;
  },
  
  removeFile: async (path: string) => {
    await supabase.storage.from(PRIMARY_BUCKET).remove([path]);
    await supabase.storage.from(LEGACY_BUCKET).remove([path]);
  },

  removeFiles: async (paths: string[]) => {
    if (!paths || paths.length === 0) return;
    await supabase.storage.from(PRIMARY_BUCKET).remove(paths);
    await supabase.storage.from(LEGACY_BUCKET).remove(paths);
  },

  getFileUrl: async (path: string) => {
    let { data, error } = await supabase.storage.from(PRIMARY_BUCKET).createSignedUrl(path, 3600);
    if (error && error.message.includes('Object not found')) {
      const legacy = await supabase.storage.from(LEGACY_BUCKET).createSignedUrl(path, 3600);
      if (!legacy.error) return legacy.data?.signedUrl;
    }
    if (error) {
      console.warn(`Object not found in storage: ${path}`);
      return null;
    }
    return data?.signedUrl;
  }
};
