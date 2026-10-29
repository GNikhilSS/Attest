import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { CodingViewComponent } from './components/coding-view/coding-view.component';

export const routes: Routes = [
    {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./components/auth/login/login.component')
          .then(m => m.LoginComponent)
    },
    {
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () => import('./components/auth/register/register.component')
          .then(m => m.RegisterComponent)
    },
    {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () => import('./components/dashboard/employee-dashboard/employee-dashboard.component')
          .then(m => m.EmployeeDashboardComponent)
    },
    {
        path: 'exams/:attemptId',
        canActivate: [authGuard],
        component: CodingViewComponent
        // loadComponent: () => import('./features/exam/take-exam/take-exam.component')
        //   .then(m => m.TakeExamComponent)
    },
    {
        path: 'attempts/:attemptId/report',
        canActivate: [authGuard],
        loadComponent: () => import('./components/grading-report/grading-report.component')
          .then(m => m.GradingReportComponent)
    },
    {
        path: '',
        pathMatch: 'full',
        redirectTo: 'login'
    },
    {
        path: '**',
        redirectTo: 'login'
    }
];
