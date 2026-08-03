/**
 * Bizarre Cafe — Supabase Database Types
 *
 * Auto-generated types for the Supabase PostgreSQL database.
 * Generate these with: `supabase gen types typescript > src/supabase/types/database.types.ts`
 *
 * This is a manual reference for the expected schema structure.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          visibility: string;
          status: string;
          type: string;
          max_agents: number;
          created_at: string;
          updated_at: string;
          created_by: string;
          member_count: number;
          message_count: number;
          active_session_id: string | null;
          tags: string[];
          settings: Json;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          visibility?: string;
          status?: string;
          type?: string;
          max_agents?: number;
          created_at?: string;
          updated_at?: string;
          created_by: string;
          member_count?: number;
          message_count?: number;
          active_session_id?: string | null;
          tags?: string[];
          settings?: Json;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          visibility?: string;
          status?: string;
          type?: string;
          max_agents?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string;
          member_count?: number;
          message_count?: number;
          active_session_id?: string | null;
          tags?: string[];
          settings?: Json;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          room_id: string;
          session_id: string | null;
          sender_id: string;
          sender_name: string;
          content: string;
          type: string;
          direction: string;
          attachment_url: string | null;
          reply_to_id: string | null;
          edited_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          session_id?: string | null;
          sender_id: string;
          sender_name: string;
          content: string;
          type?: string;
          direction?: string;
          attachment_url?: string | null;
          reply_to_id?: string | null;
          edited_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          session_id?: string | null;
          sender_id?: string;
          sender_name?: string;
          content?: string;
          type?: string;
          direction?: string;
          attachment_url?: string | null;
          reply_to_id?: string | null;
          edited_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          id: string;
          room_id: string;
          title: string;
          state: string;
          participant_ids: string[];
          metadata: Json;
          last_active_at: string;
          created_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          title: string;
          state?: string;
          participant_ids?: string[];
          metadata?: Json;
          last_active_at?: string;
          created_at?: string;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          title?: string;
          state?: string;
          participant_ids?: string[];
          metadata?: Json;
          last_active_at?: string;
          created_at?: string;
          closed_at?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          display_name: string;
          description: string | null;
          did: string | null;
          wallet_address: string | null;
          avatar_url: string | null;
          tier: string;
          tags: string[];
          skills_offered: string[];
          skills_wanted: string[];
          balance: number;
          total_spent: number;
          total_earned: number;
          x402_receipts: string[];
          language: string;
          notifications: Json;
          created_at: string;
          last_seen: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          display_name: string;
          description?: string | null;
          did?: string | null;
          wallet_address?: string | null;
          avatar_url?: string | null;
          tier?: string;
          tags?: string[];
          skills_offered?: string[];
          skills_wanted?: string[];
          balance?: number;
          total_spent?: number;
          total_earned?: number;
          x402_receipts?: string[];
          language?: string;
          notifications?: Json;
          created_at?: string;
          last_seen?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          display_name?: string;
          description?: string | null;
          did?: string | null;
          wallet_address?: string | null;
          avatar_url?: string | null;
          tier?: string;
          tags?: string[];
          skills_offered?: string[];
          skills_wanted?: string[];
          balance?: number;
          total_spent?: number;
          total_earned?: number;
          x402_receipts?: string[];
          language?: string;
          notifications?: Json;
          created_at?: string;
          last_seen?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      shop_items: {
        Row: {
          id: string;
          name: string;
          description: string;
          category: string;
          price: number;
          stock: number;
          max_stock: number;
          icon: string;
          image_url: string | null;
          is_consumable: boolean;
          effect_duration_sec: number | null;
          effects: Json;
          available_from: string | null;
          available_until: string | null;
          featured: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          category?: string;
          price?: number;
          stock?: number;
          max_stock?: number;
          icon?: string;
          image_url?: string | null;
          is_consumable?: boolean;
          effect_duration_sec?: number | null;
          effects?: Json;
          available_from?: string | null;
          available_until?: string | null;
          featured?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          category?: string;
          price?: number;
          stock?: number;
          max_stock?: number;
          icon?: string;
          image_url?: string | null;
          is_consumable?: boolean;
          effect_duration_sec?: number | null;
          effects?: Json;
          available_from?: string | null;
          available_until?: string | null;
          featured?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          item_name: string;
          quantity: number;
          total_cost: number;
          status: string;
          payment_id: string | null;
          transaction_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          item_name: string;
          quantity?: number;
          total_cost?: number;
          status?: string;
          payment_id?: string | null;
          transaction_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_id?: string;
          item_name?: string;
          quantity?: number;
          total_cost?: number;
          status?: string;
          payment_id?: string | null;
          transaction_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      receipts: {
        Row: {
          id: string;
          purchase_id: string;
          user_id: string;
          item_snapshot: Json;
          quantity: number;
          total_paid: number;
          payment_proof: string;
          server_signature: string;
          issued_at: string;
          expires_at: string | null;
          is_redeemed: boolean;
          redeemed_at: string | null;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          user_id: string;
          item_snapshot: Json;
          quantity?: number;
          total_paid?: number;
          payment_proof: string;
          server_signature: string;
          issued_at?: string;
          expires_at?: string | null;
          is_redeemed?: boolean;
          redeemed_at?: string | null;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          user_id?: string;
          item_snapshot?: Json;
          quantity?: number;
          total_paid?: number;
          payment_proof?: string;
          server_signature?: string;
          issued_at?: string;
          expires_at?: string | null;
          is_redeemed?: boolean;
          redeemed_at?: string | null;
        };
        Relationships: [];
      };
      skill_offers: {
        Row: {
          id: string;
          user_id: string;
          skill_name: string;
          category: string;
          level: string;
          description: string;
          looking_for: string;
          hours_per_week: number;
          format: string;
          status: string;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          skill_name: string;
          category?: string;
          level?: string;
          description: string;
          looking_for: string;
          hours_per_week?: number;
          format?: string;
          status?: string;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          skill_name?: string;
          category?: string;
          level?: string;
          description?: string;
          looking_for?: string;
          hours_per_week?: number;
          format?: string;
          status?: string;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trade_offers: {
        Row: {
          id: string;
          from_user_id: string;
          to_user_id: string;
          offer_details: string;
          expires_at: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          from_user_id: string;
          to_user_id: string;
          offer_details: string;
          expires_at: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          from_user_id?: string;
          to_user_id?: string;
          offer_details?: string;
          expires_at?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skill_trades: {
        Row: {
          id: string;
          participant1: string;
          participant2: string;
          offer1: string;
          offer2: string;
          status: string;
          exchange_log: string | null;
          completed_at: string | null;
          rating1: number | null;
          rating2: number | null;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          participant1: string;
          participant2: string;
          offer1: string;
          offer2: string;
          status?: string;
          exchange_log?: string | null;
          completed_at?: string | null;
          rating1?: number | null;
          rating2?: number | null;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          participant1?: string;
          participant2?: string;
          offer1?: string;
          offer2?: string;
          status?: string;
          exchange_log?: string | null;
          completed_at?: string | null;
          rating1?: number | null;
          rating2?: number | null;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cafe_events: {
        Row: {
          id: string;
          name: string;
          description: string;
          type: string;
          status: string;
          host_id: string;
          max_attendees: number;
          attendee_count: number;
          start_time: string;
          end_time: string;
          location: string | null;
          tags: string[];
          requires_payment: boolean;
          payment_amount: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          type?: string;
          status?: string;
          host_id: string;
          max_attendees?: number;
          attendee_count?: number;
          start_time: string;
          end_time: string;
          location?: string | null;
          tags?: string[];
          requires_payment?: boolean;
          payment_amount?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          type?: string;
          status?: string;
          host_id?: string;
          max_attendees?: number;
          attendee_count?: number;
          start_time?: string;
          end_time?: string;
          location?: string | null;
          tags?: string[];
          requires_payment?: boolean;
          payment_amount?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_attendance: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          status: string;
          joined_at: string;
          left_at: string | null;
          attended_at: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          status?: string;
          joined_at?: string;
          left_at?: string | null;
          attended_at?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string;
          status?: string;
          joined_at?: string;
          left_at?: string | null;
          attended_at?: string | null;
        };
        Relationships: [];
      };
      payment_promises: {
        Row: {
          id: string;
          payer_id: string;
          payee_id: string;
          description: string;
          amount: number;
          currency: string;
          deadline: string;
          status: string;
          x402_payment_id: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          payer_id: string;
          payee_id: string;
          description: string;
          amount: number;
          currency?: string;
          deadline: string;
          status?: string;
          x402_payment_id?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          payer_id?: string;
          payee_id?: string;
          description?: string;
          amount?: number;
          currency?: string;
          deadline?: string;
          status?: string;
          x402_payment_id?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      x402_payments: {
        Row: {
          id: string;
          proposal_id: string;
          type: string;
          amount: number;
          currency: string;
          from_address: string;
          to_address: string;
          status: string;
          receipt: string;
          txn_hash: string | null;
          memo: string | null;
          is_micro_payment: boolean;
          subscription_interval: string | null;
          created_at: string;
          settled_at: string | null;
        };
        Insert: {
          id?: string;
          proposal_id: string;
          type?: string;
          amount: number;
          currency?: string;
          from_address: string;
          to_address: string;
          status?: string;
          receipt: string;
          txn_hash?: string | null;
          memo?: string | null;
          is_micro_payment?: boolean;
          subscription_interval?: string | null;
          created_at?: string;
          settled_at?: string | null;
        };
        Update: {
          id?: string;
          proposal_id?: string;
          type?: string;
          amount?: number;
          currency?: string;
          from_address?: string;
          to_address?: string;
          status?: string;
          receipt?: string;
          txn_hash?: string | null;
          memo?: string | null;
          is_micro_payment?: boolean;
          subscription_interval?: string | null;
          created_at?: string;
          settled_at?: string | null;
        };
        Relationships: [];
      };
      verification_challenges: {
        Row: {
          id: string;
          user_id: string;
          method: string;
          challenge: string;
          status: string;
          proof: string | null;
          expires_at: string;
          created_at: string;
          verified_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          method?: string;
          challenge: string;
          status?: string;
          proof?: string | null;
          expires_at: string;
          created_at?: string;
          verified_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          method?: string;
          challenge?: string;
          status?: string;
          proof?: string | null;
          expires_at?: string;
          created_at?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      verification_results: {
        Row: {
          id: string;
          user_id: string;
          method: string;
          verified: boolean;
          failure_reason: string | null;
          signature: string | null;
          verified_at: string;
          ttl_seconds: number;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          method?: string;
          verified?: boolean;
          failure_reason?: string | null;
          signature?: string | null;
          verified_at?: string;
          ttl_seconds?: number;
          expires_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          method?: string;
          verified?: boolean;
          failure_reason?: string | null;
          signature?: string | null;
          verified_at?: string;
          ttl_seconds?: number;
          expires_at?: string;
        };
        Relationships: [];
      };
      agent_status: {
        Row: {
          user_id: string;
          presence: string;
          last_seen: string;
          status_message: string | null;
          accepts_connections: boolean;
          capabilities: string[];
          version: string | null;
          is_verified: boolean;
          verification_level: string;
        };
        Insert: {
          user_id: string;
          presence?: string;
          last_seen?: string;
          status_message?: string | null;
          accepts_connections?: boolean;
          capabilities?: string[];
          version?: string | null;
          is_verified?: boolean;
          verification_level?: string;
        };
        Update: {
          user_id?: string;
          presence?: string;
          last_seen?: string;
          status_message?: string | null;
          accepts_connections?: boolean;
          capabilities?: string[];
          version?: string | null;
          is_verified?: boolean;
          verification_level?: string;
        };
        Relationships: [];
      };
      owner_messages: {
        Row: {
          id: string;
          category: string;
          content: string;
          target: string[];
          delivered: boolean;
          read: boolean;
          created_at: string;
          delivered_at: string | null;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          category?: string;
          content: string;
          target?: string[];
          delivered?: boolean;
          read?: boolean;
          created_at?: string;
          delivered_at?: string | null;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          category?: string;
          content?: string;
          target?: string[];
          delivered?: boolean;
          read?: boolean;
          created_at?: string;
          delivered_at?: string | null;
          read_at?: string | null;
        };
        Relationships: [];
      };
      owner_mood: {
        Row: {
          id: string;
          mood: string;
          last_changed_at: string;
          persistence_minutes: number;
          triggers: string[];
          greeting: string | null;
          catchphrase: string | null;
        };
        Insert: {
          id?: string;
          mood?: string;
          last_changed_at?: string;
          persistence_minutes?: number;
          triggers?: string[];
          greeting?: string | null;
          catchphrase?: string | null;
        };
        Update: {
          id?: string;
          mood?: string;
          last_changed_at?: string;
          persistence_minutes?: number;
          triggers?: string[];
          greeting?: string | null;
          catchphrase?: string | null;
        };
        Relationships: [];
      };
      narrative_events: {
        Row: {
          id: string;
          category: string;
          severity: string;
          description: string;
          active: boolean;
          start_time: string;
          duration_sec: number;
          effect: Json;
          applied: boolean;
          created_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          category?: string;
          severity?: string;
          description: string;
          active?: boolean;
          start_time?: string;
          duration_sec?: number;
          effect?: Json;
          applied?: boolean;
          created_at?: string;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          category?: string;
          severity?: string;
          description?: string;
          active?: boolean;
          start_time?: string;
          duration_sec?: number;
          effect?: Json;
          applied?: boolean;
          created_at?: string;
          ended_at?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      decrement_stock: {
        Args: { p_item_id: string; p_quantity: number };
        Returns: boolean;
      };
      increment_attendee_count: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      decrement_attendee_count: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}
