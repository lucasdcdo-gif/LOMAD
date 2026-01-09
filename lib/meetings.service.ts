
import { Meeting, UserRole, TranscriptionEntry } from '../types.ts';

const API_BASE = '/api';

/**
 * Service Layer atualizada para API Node.js
 * Mantém a segurança escondendo as chaves no servidor.
 */
export const MeetingsService = {
  async saveMeeting(uid: string, data: TranscriptionEntry[], role: UserRole) {
    // Save raw JSON array to leverage jsonb column capabilities
    const transcriptionsJson = data;
    const expiresDays = role === 'FREE' ? 30 : 180;

    const meetingData = {
      user_id: uid,
      title: `Reunião ${new Date().toLocaleString('pt-BR')}`,
      transcriptions: transcriptionsJson,
      summary: "",
      timestamp: Date.now(),
      expires_at: Date.now() + (expiresDays * 24 * 60 * 60 * 1000)
    };

    const response = await fetch(`${API_BASE}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingData })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao salvar no servidor');
    }

    return response.json();
  },

  async fetchUserMeetings(uid: string) {
    const response = await fetch(`${API_BASE}/meetings/${uid}`);
    if (!response.ok) throw new Error('Erro ao carregar histórico');
    return response.json();
  },

  async generateAiSummary(meetingId: string, text: string) {
    const response = await fetch(`${API_BASE}/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, text })
    });

    if (!response.ok) throw new Error('Erro ao processar IA');
    return response.json();
  },

  async upgradeUserToPro(uid: string) {
    const response = await fetch(`${API_BASE}/user/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid })
    });

    if (!response.ok) throw new Error('Erro no upgrade de plano');
    return response.json();
  },

  async sendChat(meetingContext: string, userPrompt: string, history: { role: 'user' | 'model', text: string }[]) {
    const response = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingContext, userPrompt, history })
    });

    if (!response.ok) throw new Error('Erro ao processar chat');
    return response.json();
  },

  async updateMeetingTitle(id: string, title: string) {
    const response = await fetch(`${API_BASE}/meetings/${id}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });



    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro ao atualizar título');
    }
    return response.json();
  }
};
