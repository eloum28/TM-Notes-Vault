export interface Note {
  id: string;
  created_at: string;
  title: string;
  content: string; 
  is_encrypted: boolean;
  category: string;
  attachments?: string[]; 
  iv?: string;       
  title_iv?: string; 
  salt?: string;
  user_id: string;
}