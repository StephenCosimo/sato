import { MatLinkPreviewModule } from '@angular-material-extensions/link-preview';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NgxLinkifyjsModule } from 'ngx-linkifyjs';
import { CatalogPageComponent } from './components/pages/catalog-page/catalog-page.component';
import { MainPageComponent } from './components/pages/main-page/main-page.component';
import { ResourcesListComponent } from './components/pages/resources-list/resources-list.component';
import { SearchPageComponent } from './components/pages/search-page/search-page.component';
import {AdvancedSearchComponent} from './components/pages/advanced-search/advanced-search.component';
import {UserInterestsPageComponent} from './components/pages/user-interests-page/user-interests-page.component';

const routes: Routes = [
    {path: '', component: MainPageComponent},
    {path: 'search', component: SearchPageComponent},
    {path: 'catalog', component: CatalogPageComponent},
    {path: 'catalog/:resourceType', component: ResourcesListComponent},
    {path: 'advanced-search', component: AdvancedSearchComponent},
    {path: 'interests', component: UserInterestsPageComponent}
];

@NgModule({
    imports: [
        RouterModule.forRoot(routes),
        NgxLinkifyjsModule.forRoot(),
        MatLinkPreviewModule.forRoot()
    ],
    exports: [RouterModule]
})
export class AppRoutingModule {
}
