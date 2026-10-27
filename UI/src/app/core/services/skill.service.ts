import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Skill {
  id: number;
  skillName: string;
}

@Injectable({
  providedIn: 'root'
})
export class SkillService {
  private readonly apiUrl = 'http://localhost:3000/skills'; 

  constructor(private http: HttpClient) { }

  getSkills(): Observable<{ skills: Skill[] }>{
    return this.http.get<{ skills: Skill[] }>(this.apiUrl)
  };
}
