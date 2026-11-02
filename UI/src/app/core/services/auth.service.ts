
import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { Employee } from '../../models/employee.model';

interface AuthResponse {
  employeeId: number;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly authUrl = 'http://localhost:3000/auth';
  private readonly tokenKey = 'access_token';
  private readonly employeeKey = 'employee_details';

  constructor(private http: HttpClient) {}

  login(employeeId: number, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(
        `${this.authUrl}/login`,
        { employeeId, password },
        {
          observe: 'response',
          withCredentials: true
        }
      )
      .pipe(
        tap(res => this.saveTokenFromResponse(res)),
        map(res => {
          if (!res.body) {
            throw new Error('Login response body is missing');
          }
          return res.body;
        }),
        tap(res =>
          this.saveEmployee({
            employeeId: res.employeeId,
            employeeName: res.name
          } as Employee)
        )
      );
  }

  register(
    employeeName: string,
    password: string
  ): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(
        `${this.authUrl}/register`,
        { employeeName, password },
        {
          observe: 'response',
          withCredentials: true
        }
      )
      .pipe(
        tap(res => this.saveTokenFromResponse(res)),
        map(res => {
          if (!res.body) {
            throw new Error('Registration response body is missing');
          }
          return res.body;
        }),
        tap(res =>
          this.saveEmployee({
            employeeId: res.employeeId,
            employeeName: res.name
          } as Employee)
        )
      );
  }

  refresh(): Observable<string> {
    return this.http
      .post(
        `${this.authUrl}/refresh`,
        {},
        {
          observe: 'response',
          withCredentials: true
        }
      )
      .pipe(
        map(res => {
          const token = this.extractToken(res);

          if (!token) {
            throw new Error(
              'Refresh response did not contain an access token'
            );
          }

          this.saveToken(token);
          return token;
        })
      );
  }

  private saveTokenFromResponse(
    res: HttpResponse<AuthResponse>
  ): void {
    const token = this.extractToken(res);

    if (!token) {
      throw new Error('Response did not contain an access token');
    }

    this.saveToken(token);
  }

  private extractToken(
    res: HttpResponse<unknown>
  ): string | null {
    const authorization = res.headers.get('Authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }

    return authorization.slice(7);
  }

  private saveEmployee(employee: Employee): void {
    localStorage.setItem(
      this.employeeKey,
      JSON.stringify(employee)
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
    localStorage.removeItem(this.employeeKey);
  }

  getEmployee(): Employee | null {
    const employee = localStorage.getItem(this.employeeKey);

    return employee
      ? JSON.parse(employee) as Employee
      : null;
  }
}
