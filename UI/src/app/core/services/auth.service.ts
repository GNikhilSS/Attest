import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

interface Employee {
  id: number;
  name: string;
}

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

  constructor(private http: HttpClient) { }

  login(employeeId: number): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.authUrl}/login`, {employeeId})
      .pipe(
        tap(res => this.saveToken(res.token))
      );
  }

  register(employeeName: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.authUrl}/register`, {employeeName})
      .pipe(
        tap(res => this.saveToken(res.token))
      );
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
}
