import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CodingViewComponent } from './coding-view.component';

describe('CodingViewComponent', () => {
  let component: CodingViewComponent;
  let fixture: ComponentFixture<CodingViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodingViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CodingViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
