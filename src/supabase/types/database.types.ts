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
                    owner_id?: string | null;
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
                  owner_id?: string | null;
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
                  owner_id?: string | null;
        };
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
      };
      messages: {
        Row: {
          id: string;
          room_id: string;
          session_id: string | null;
          sender_id: string;
          sender_name: string;
          content?: string;
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
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
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
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
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
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
      };
      shop_items: {
              Row: {
                      id: string;
                      name: string;
                      description: string;
                      price: number;
                      currency: string;
                      image_url: string | null;
                      stock: number | null;
                      tags: string[];
                      is_active: boolean;
                      created_at: string;
                      category?: string | null;
          };
              Insert: {
                          id?: string;
                          name?: string;
                          description?: string;
                          price?: number;
                          currency?: string;
                          image_url?: string | null;
                          stock?: number | null;
                          tags?: string[];
                          is_active?: boolean;
                          created_at?: string;
                          category?: string | null;
              };
              Update: {
                          id?: string;
                          name?: string;
                          description?: string;
                          price?: number;
                          currency?: string;
                          image_url?: string | null;
                          stock?: number | null;
                          tags?: string[];
                          is_active?: boolean;
                          created_at?: string;
                          category?: string | null;
              };
              Relationships: any[];
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
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
      };
      receipts: {
              Row: {
            id: string;
            user_id: string;
            item_id: string;
            quantity: number;
            total_amount: number;
            currency: string;
            payment_method: string;
            status: string;
            x402_promise_id: string | null;
            created_at: string;
          };
              Insert: {
            id?: string;
            user_id?: string;
            item_id?: string;
            quantity?: number;
            total_amount?: number;
            currency?: string;
            payment_method?: string;
            status?: string;
            x402_promise_id?: string | null;
            created_at?: string;
          };
              Update: {
            id?: string;
            user_id?: string;
            item_id?: string;
            quantity?: number;
            total_amount?: number;
            currency?: string;
            payment_method?: string;
            status?: string;
            x402_promise_id?: string | null;
            created_at?: string;
          };
              Relationships: any[];
            };
      skill_offers: {
        agent_id: string;
              Row: {
                                          id: string;
                                          user_id: string;
                                          skill_name: string;
                                          description: string;
                                          tags: string[];
                                          wanted_skill: string | null;
                                          wanted_description: string | null;
                                          status: string;
                                          created_at: string;
                                          updated_at: string;
                                          looking_for?: string | null;
                                category?: string | null;
                      level?: string | null;
          };
              Insert: {
                                                      id?: string;
                                                      user_id?: string;
                                                      skill_name?: string;
                                                      description?: string;
                                                      tags?: string[];
                                                      wanted_skill?: string | null;
                                                      wanted_description?: string | null;
                                                      status?: string;
                                                      created_at?: string;
                                                      updated_at?: string;
                                                      looking_for?: string | null;
                                            category?: string | null;
                              level?: string | null;
              };
              Update: {
                                                      id?: string;
                                                      user_id?: string;
                                                      skill_name?: string;
                                                      description?: string;
                                                      tags?: string[];
                                                      wanted_skill?: string | null;
                                                      wanted_description?: string | null;
                                                      status?: string;
                                                      created_at?: string;
                                                      updated_at?: string;
                                                      looking_for?: string | null;
                                            category?: string | null;
                              level?: string | null;
              };
              Relationships: any[];
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
            from_user_id?: string;
            to_user_id?: string;
            offer_details?: string;
            expires_at?: string;
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
              Relationships: any[];
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
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
      };
      cafe_events: {
              Row: {
            id: string;
            name: string;
            description: string;
            type: string;
            max_attendees: number;
            location: string | null;
            host_id: string;
            status: string;
            start_time: string;
            created_at: string;
            updated_at: string;
            attendee_count: number;
            tags: string[];
            requires_payment: boolean;
            payment_amount: number | null;
            metadata: Json;
          };
              Insert: {
            id?: string;
            name?: string;
            description?: string;
            type?: string;
            max_attendees?: number;
            location?: string | null;
            host_id?: string;
            status?: string;
            start_time?: string;
            created_at?: string;
            updated_at?: string;
            attendee_count?: number;
            tags?: string[];
            requires_payment?: boolean;
            payment_amount?: number | null;
            metadata?: Json;
          };
              Update: {
            id?: string;
            name?: string;
            description?: string;
            type?: string;
            max_attendees?: number;
            location?: string | null;
            host_id?: string;
            status?: string;
            start_time?: string;
            created_at?: string;
            updated_at?: string;
            attendee_count?: number;
            tags?: string[];
            requires_payment?: boolean;
            payment_amount?: number | null;
            metadata?: Json;
          };
              Relationships: any[];
            };
      event_attendance: {
              Row: {
            id: string;
            event_id: string;
            status: string;
            user_id: string;
            joined_at: string;
            updated_at: string;
            left_at: string | null;
            attended_at: string | null;
          };
              Insert: {
            id?: string;
            event_id?: string;
            status?: string;
            user_id?: string;
            joined_at?: string;
            updated_at?: string;
            left_at?: string | null;
            attended_at?: string | null;
          };
              Update: {
            id?: string;
            event_id?: string;
            status?: string;
            user_id?: string;
            joined_at?: string;
            updated_at?: string;
            left_at?: string | null;
            attended_at?: string | null;
          };
              Relationships: any[];
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
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
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
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
      };
      verification_challenges: {
              Row: {
                      id: string;
                      status: string;
                      user_id: string;
                      challenge: string;
                      proof?: string | null;
                      expires_at: string;
                      method: string;
                      created_at: string;
                      updated_at: string;
                      verified_at?: string | null;
          };
              Insert: {
                          id?: string;
                          status?: string;
                          user_id?: string;
                          challenge?: string;
                          proof?: string | null;
                          expires_at?: string;
                          method?: string;
                          created_at?: string;
                          updated_at?: string;
                          verified_at?: string | null;
              };
              Update: {
                          id?: string;
                          status?: string;
                          user_id?: string;
                          challenge?: string;
                          proof?: string | null;
                          expires_at?: string;
                          method?: string;
                          created_at?: string;
                          updated_at?: string;
                          verified_at?: string | null;
              };
              Relationships: any[];
            };
      verification_results: {
        Row: {
          id: string;
          user_id: string;
          method: string;
          verified?: boolean;
          failure_reason?: string | null;
          signature?: string | null;
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
        Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];
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
              Relationships: any[];
            };
      owner_messages: {
              Row: {
            id: string;
            agent_id?: string;
            content?: string;
            sentiment: string | null;
            is_owner_response: boolean;
            delivered?: boolean | null;
            read?: boolean | null;
            delivered_at?: string | null;
            read_at?: string | null;
            created_at: string;
          };
              Insert: {
            id?: string;
            agent_id?: string;
            content?: string;
            sentiment?: string | null;
            is_owner_response?: boolean;
            delivered?: boolean | null;
            read?: boolean | null;
            delivered_at?: string | null;
            read_at?: string | null;
            created_at?: string;
          };
              Update: {
            id?: string;
            agent_id?: string;
            content?: string;
            sentiment?: string | null;
            is_owner_response?: boolean;
            delivered?: boolean | null;
            read?: boolean | null;
            delivered_at?: string | null;
            read_at?: string | null;
            created_at?: string;
          };
              Relationships: any[];
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
            stress_level: number;
            last_interaction: string;
            total_interactions: number;
          };
              Insert: {
            id?: string;
            mood?: string;
            last_changed_at?: string;
            persistence_minutes?: number;
            triggers?: string[];
            greeting?: string | null;
            catchphrase?: string | null;
            stress_level?: number;
            last_interaction?: string;
            total_interactions?: number;
          };
              Update: {
            id?: string;
            mood?: string;
            last_changed_at?: string;
            persistence_minutes?: number;
            triggers?: string[];
            greeting?: string | null;
            catchphrase?: string | null;
            stress_level?: number;
            last_interaction?: string;
            total_interactions?: number;
          };
              Relationships: any[];
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
            title: string;
            type: string;
            affected_rooms: string[] | null;
            triggered_at: string;
            agent_id?: string | null;
          };
              Insert: {
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
            title?: string;
            type?: string;
            affected_rooms?: string[] | null;
            triggered_at?: string;
            agent_id?: string | null;
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
            title?: string;
            type?: string;
            affected_rooms?: string[] | null;
            triggered_at?: string;
            agent_id?: string | null;
          };
              Relationships: any[];
            };
          cafe_visual_state: {
                  Row: {
                id: string;
                entity_id: string;
                attribute: string;
                description: string;
                last_updated: string;
              };
                  Insert: {
                id?: string;
                entity_id?: string;
                attribute?: string;
                description?: string;
                last_updated?: string;
              };
                  Update: {
                id?: string;
                entity_id?: string;
                attribute?: string;
                description?: string;
                last_updated?: string;
              };
                  Relationships: any[];
                };
          skill_requests: {
                  Row: {
                              id: string;
                              user_id: string;
                              requested_skill: string;
                              description: string;
                              offered_value: string | null;
                              status: string;
                              created_at: string;
                              updated_at: string;
                              agent_id?: string;
              };
                  Insert: {
                                  id?: string;
                                  user_id?: string;
                                  requested_skill?: string;
                                  description?: string;
                                  offered_value?: string | null;
                                  status?: string;
                                  created_at?: string;
                                  updated_at?: string;
                                  agent_id?: string;
                  };
                  Update: {
                                  id?: string;
                                  user_id?: string;
                                  requested_skill?: string;
                                  description?: string;
                                  offered_value?: string | null;
                                  status?: string;
                                  created_at?: string;
                                  updated_at?: string;
                                  agent_id?: string;
                  };
                  Relationships: any[];
                };
          trades: {
                  Row: {
                              id: string;
                              offer_id: string;
                              request_id: string | null;
                              from_agent_id: string;
                              to_user_id: string;
                              status: string;
                              notes: string | null;
                              created_at: string;
                              updated_at: string;
                              to_agent_id?: string;
              };
                  Insert: {
                                  id?: string;
                                  offer_id?: string;
                                  request_id?: string | null;
                                  from_agent_id?: string;
                                  to_user_id?: string;
                                  status?: string;
                                  notes?: string | null;
                                  created_at?: string;
                                  updated_at?: string;
                                  to_agent_id?: string;
                  };
                  Update: {
                                  id?: string;
                                  offer_id?: string;
                                  request_id?: string | null;
                                  from_agent_id?: string;
                                  to_user_id?: string;
                                  status?: string;
                                  notes?: string | null;
                                  created_at?: string;
                                  updated_at?: string;
                                  to_agent_id?: string;
                  };
                  Relationships: any[];
                };
          agent_verification: {
                  Row: {
                                                                        id: string;
                                                                        user_id: string;
                                                                        is_verified: boolean;
                                                                        wallet_address: string | null;
                                                                        did_document: string | null;
                                                                        verified_at?: string | null;
                                                                        tier: string;
                                                                        updated_at: string;
                                                                        created_at: string;
                                                                        status: string;
                                                                        method: string;
                                                                        agent_id?: string;
                                                          verified?: boolean;
                                            failure_reason?: string | null;
                              signature?: string | null;
              };
                  Insert: {
                                                                                        id?: string;
                                                                                        user_id?: string;
                                                                                        is_verified?: boolean;
                                                                                        wallet_address?: string | null;
                                                                                        did_document?: string | null;
                                                                                        verified_at?: string | null;
                                                                                        tier?: string;
                                                                                        updated_at?: string;
                                                                                        created_at?: string;
                                                                                        status?: string;
                                                                                        method?: string;
                                                                                        agent_id?: string;
                                                                          verified?: boolean;
                                                        failure_reason?: string | null;
                                      signature?: string | null;
                  };
                  Update: {
                                                                                        id?: string;
                                                                                        user_id?: string;
                                                                                        is_verified?: boolean;
                                                                                        wallet_address?: string | null;
                                                                                        did_document?: string | null;
                                                                                        verified_at?: string | null;
                                                                                        tier?: string;
                                                                                        updated_at?: string;
                                                                                        created_at?: string;
                                                                                        status?: string;
                                                                                        method?: string;
                                                                                        agent_id?: string;
                                                                          verified?: boolean;
                                                        failure_reason?: string | null;
                                      signature?: string | null;
                  };
                  Relationships: any[];
                };
          lore_entries: {
                  Row: {
                id: string;
                title: string;
                content?: string;
                category: string;
                discovered: boolean;
                created_at: string;
              };
                  Insert: {
                id?: string;
                title?: string;
                content?: string;
                category?: string;
                discovered?: boolean;
                created_at?: string;
              };
                  Update: {
                id?: string;
                title?: string;
                content?: string;
                category?: string;
                discovered?: boolean;
                created_at?: string;
              };
                  Relationships: any[];
                };
          canned_responses: {
                  Row: {
                                            id: string;
                                            trigger_keyword: string;
                                            response_text: string;
                                            created_at: string;
                                            key?: string;
                              content?: string;
              };
                  Insert: {
                                                    id?: string;
                                                    trigger_keyword?: string;
                                                    response_text?: string;
                                                    created_at?: string;
                                                    key?: string;
                                      content?: string;
                  };
                  Update: {
                                                    id?: string;
                                                    trigger_keyword?: string;
                                                    response_text?: string;
                                                    created_at?: string;
                                                    key?: string;
                                      content?: string;
                  };
                  Relationships: any[];
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
    Enums: {
      [_ in never]: never;
    };
  };
}
