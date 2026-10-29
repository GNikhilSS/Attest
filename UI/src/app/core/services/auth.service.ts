import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Employee } from '../../models/employee.model';

interface AuthResponse {
  token: string;
  employee: Employee;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly authUrl = 'http://localhost:3000/auth';
  private readonly tokenKey = 'access_token';
  private readonly employeeKey = 'employee_details';

  constructor(private http: HttpClient) { }

  login(employeeId: number): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.authUrl}/login`, {employeeId})
      .pipe(
        tap(res => {
            this.saveToken(res.token);
            this.saveEmployee(res.employee);
          })
      );
  }

  register(employeeName: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.authUrl}/register`, {employeeName})
      .pipe(
        tap(res => {
            this.saveToken(res.token);
            this.saveEmployee(res.employee);
          })
      );
  }

  private saveEmployee(employee: Employee): void {
    localStorage.setItem(this.employeeKey, JSON.stringify(employee));
  }

  private saveToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
  }

  getEmployee(): Employee | null {
    const employee = localStorage.getItem(this.employeeKey);
    return employee ? JSON.parse(employee) as Employee : null;
  }
}
