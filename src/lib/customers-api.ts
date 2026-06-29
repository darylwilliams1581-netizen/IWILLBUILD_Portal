// Shared types and API helpers for Customers

export interface Customer {
  id: number;
  company_id: number;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  billing_address: string | null;
  abn: string | null;
  notes: string | null;
  status: 'active' | 'archived';
  job_count?: number;
  created_at: string;
  updated_at: string;
}

export async function fetchCustomers(status: 'active' | 'archived' | 'all' = 'active'): Promise<Customer[]> {
  const res = await fetch(`/api/customers?status=${status}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch customers');
  const d = await res.json() as { customers: Customer[] };
  return d.customers;
}

export async function fetchCustomer(id: number): Promise<{ customer: Customer; jobs: unknown[] }> {
  const res = await fetch(`/api/customers/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch customer');
  return res.json();
}

export async function createCustomer(payload: Partial<Customer>): Promise<Customer> {
  const res = await fetch('/api/customers', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'Failed to create customer');
  return d.customer;
}

export async function updateCustomer(id: number, payload: Partial<Customer>): Promise<Customer> {
  const res = await fetch(`/api/customers/${id}`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'Failed to update customer');
  return d.customer;
}

export async function archiveCustomer(id: number): Promise<void> {
  const res = await fetch(`/api/customers/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) {
    const d = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(d.error ?? 'Failed to archive customer');
  }
}
