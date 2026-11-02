
import { Component } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  employeeId: number | null = null;
  password = '';
  loading = false;
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  onSubmit(): void {
    this.errorMessage = '';

    if (
      this.employeeId === null ||
      !Number.isInteger(this.employeeId) ||
      this.employeeId <= 0
    ) {
      this.errorMessage = 'Enter a valid employee ID.';
      return;
    }

    if (!this.password || this.password.length < 4 || this.password.length > 16) {
      this.errorMessage = 'Password must be between 4 and 16 characters.';
      return;
    }

    this.loading = true;

    this.authService.login(this.employeeId, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error.error?.message ?? 'Login failed. Please try again.';
      }
    });
  }
}
