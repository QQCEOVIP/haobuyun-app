import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/storage/supabase';

// Force production URL - do not use environment variable
const getBackendBaseUrl = () => {
  return 'https://kdsf38dsn9.coze.site';
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  refreshAvatar: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string, metadata?: Record<string, any>) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  /**
   * Fetch user profile from backend and cache avatar URL to AsyncStorage.
   * Also updates the avatarUrl state so consumers can subscribe directly.
   * Called after login so other screens can display the avatar immediately.
   */
  const fetchAndCacheAvatar = async (userId: string) => {
    console.log('[fetchAndCacheAvatar] Called for userId:', userId);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      headers['x-user-id'] = userId;
      const apiUrl = `${getBackendBaseUrl()}/api/v1/profile`;
      console.log('[fetchAndCacheAvatar] API URL:', apiUrl);
      console.log('[fetchAndCacheAvatar] Headers:', { 'x-user-id': userId });
      
      const response = await fetch(apiUrl, { headers });
      console.log('[fetchAndCacheAvatar] API response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('[fetchAndCacheAvatar] API response data:', JSON.stringify(result));
        const url = result.profile?.avatar_url;
        console.log('[fetchAndCacheAvatar] Avatar URL from API:', url);
        
        if (url) {
          // Validate URL format
          if (url.startsWith('http://') || url.startsWith('https://')) {
            await AsyncStorage.setItem('@user_avatar', url);
            setAvatarUrl(url); // Also update state for immediate consumption
            console.log('[fetchAndCacheAvatar] setAvatarUrl called with:', url);
          } else {
            console.warn('[fetchAndCacheAvatar] Invalid avatar URL format:', url);
          }
        } else {
          console.log('[fetchAndCacheAvatar] No avatar URL in profile');
        }
      } else {
        const errorText = await response.text();
        console.warn('[fetchAndCacheAvatar] Profile fetch failed with status:', response.status, 'error:', errorText);
      }
    } catch (error) {
      console.warn('[fetchAndCacheAvatar] Failed to cache avatar on login:', error);
    }
  };

  useEffect(() => {
    const loadCachedAvatar = async () => {
      try {
        const cachedAvatar = await AsyncStorage.getItem('@user_avatar');
        if (cachedAvatar) {
          setAvatarUrl(cachedAvatar);
        }
      } catch (error) {
        console.error('[AuthContext] Failed to load cached avatar:', error);
      }
    };
    
    loadCachedAvatar();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] onAuthStateChange event:', event, 'session:', !!session);
      
      if (event === 'SIGNED_IN' && session) {
        setSession(session);
        setUser(session.user);
        await fetchAndCacheAvatar(session.user.id);
      } else if (event === 'INITIAL_SESSION' && session) {
        setSession(session);
        setUser(session.user);
        await fetchAndCacheAvatar(session.user.id);
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setAvatarUrl(null);
        await AsyncStorage.removeItem('@user_avatar');
        setIsLoading(false);
      }
    });

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[AuthContext] Initial session check:', !!session);
        if (session) {
          setSession(session);
          setUser(session.user);
          await fetchAndCacheAvatar(session.user.id);
        }
      } catch (error) {
        console.error('[AuthContext] Session check error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkSession();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signUpWithEmail = async (email: string, password: string, metadata?: Record<string, any>) => {
    // 注册（Supabase默认会发送验证邮件）
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: metadata ? { data: metadata } : undefined,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  };

  /**
   * Fetch avatar URL directly from Supabase storage using public URL.
   * This is a fallback method when backend API is not available.
   */
  const fetchAvatar = async (userId: string): Promise<string | null> => {
    try {
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(`${userId}/avatar.png`);
      
      const url = publicUrlData?.publicUrl;
      if (url) {
        console.log('[fetchAvatar] Got public URL from Supabase storage:', url);
        return url;
      }
      return null;
    } catch (error) {
      console.warn('[fetchAvatar] Failed to get avatar from storage:', error);
      return null;
    }
  };

  /**
   * Refresh avatar for current user - re-fetches from backend and updates state.
   * Call this after uploading a new avatar to update the UI immediately.
   */
  const refreshAvatar = async () => {
    if (!user) return;
    console.log('[refreshAvatar] Refreshing avatar for user:', user.id);
    
    // Try backend API first
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      headers['x-user-id'] = user.id;
      const apiUrl = `${getBackendBaseUrl()}/api/v1/profile`;
      
      const response = await fetch(apiUrl, { headers });
      if (response.ok) {
        const result = await response.json();
        const url = result.profile?.avatar_url;
        
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          await AsyncStorage.setItem('@user_avatar', url);
          setAvatarUrl(url);
          console.log('[refreshAvatar] Updated avatar from backend:', url);
          return;
        }
      }
    } catch (error) {
      console.warn('[refreshAvatar] Backend API failed, trying storage fallback:', error);
    }
    
    // Fallback to Supabase storage
    const storageUrl = await fetchAvatar(user.id);
    if (storageUrl) {
      await AsyncStorage.setItem('@user_avatar', storageUrl);
      setAvatarUrl(storageUrl);
      console.log('[refreshAvatar] Updated avatar from storage:', storageUrl);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextType = {
    session,
    user,
    isLoading,
    isAuthenticated: !!session && !!user,
    avatarUrl,
    setAvatarUrl,
    refreshAvatar,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
