import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EmployeeListItem {
  id: number;
  name: string;
  role: string;
  managedById: number | null;
  manager?: { id: number; name: string } | null;
  _count?: { reports: number };
}

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {
  private readonly apiUrl = 'http://localhost:3000/employees';

  constructor(private http: HttpClient) {}

  getAllEmployees(): Observable<{ employees: EmployeeListItem[] }> {
    return this.http.get<{ employees: EmployeeListItem[] }>(this.apiUrl);
  }

  assignManager(employeeId: number, managerId: number | null): Observable<{ employee: EmployeeListItem }> {
    return this.http.patch<{ employee: EmployeeListItem }>(
      `${this.apiUrl}/${employeeId}/manager`,
      { managerId }
    );
  }
}

