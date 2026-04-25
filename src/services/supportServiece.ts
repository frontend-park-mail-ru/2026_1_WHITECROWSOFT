import { client } from '../client/client.js';

export interface SupportCategory {
	id: number;
	name: string;
	description: string;
}

export interface CreateTicketRequest {
	title: string;
	description: string;
	category_id: number;
}

export interface TicketResponse {
	id: string;
	user_id: string;
	category_id: number;
	category_name: string;
	status_id: number;
	status_name: string;
	title: string;
	description: string;
	priority: number;
	created_at: string;
	updated_at: string;
	resolved_at?: string;
	message_count: number;
}

export interface TicketsListResponse {
	tickets: TicketResponse[];
	total: number;
}

export interface TicketStatsResponse {
	total: number;
	open: number;
	in_progress: number;
	waiting_user: number;
	closed: number;
	bug_count: number;
	suggestion_count: number;
	complaint_count: number;
	average_rating?: number;
}

export const supportService = {
	async createTicket(data: CreateTicketRequest): Promise<TicketResponse> {
		const ticket = await client.post<TicketResponse>('/support/tickets', data);
		return ticket;
	},

	async getUserTickets(
		limit?: number,
		offset?: number,
	): Promise<TicketsListResponse> {
		let url = '/support/tickets';
		const params = new URLSearchParams();
		if (limit !== undefined) params.append('limit', limit.toString());
		if (offset !== undefined) params.append('offset', offset.toString());
		if (params.toString()) url += `?${params.toString()}`;

		const response = await client.get<TicketsListResponse>(url);
		return response;
	},

	async getStats(): Promise<TicketStatsResponse> {
		const stats = await client.get<TicketStatsResponse>('/support/stats');
		return stats;
	},

	async getUserStats(): Promise<TicketStatsResponse> {
		const stats = await client.get<TicketStatsResponse>('/support/user-stats');
		return stats;
	},
};
