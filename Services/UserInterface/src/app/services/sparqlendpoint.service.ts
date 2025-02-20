import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { RdfNamespace } from '../constants/RdfNamespace';
import { ResourceSearchInput } from '../models/ResourceSearchInput';
import { APICountResponse, APISearchResponse } from '../models/SearchResponses';
import { SPARQLResource } from '../models/SPARQLResource';

@Injectable({
    providedIn: 'root'
})
export class SPARQLEndpointService {
    readonly SUGGESTIONS_COUNT = 8;

    private contentTypeHeader = 'application/json';
    private acceptHeader = 'application/ld+json, application/sparql-results+json';

    constructor(private http: HttpClient) {
    }

    public countClassInstances(sparqlClass: string, filterOptions?: ResourceSearchInput): Observable<number> {
        const body = this.constructCountClassInstancesRequestBody(sparqlClass, filterOptions);
        const httpOptions = this.getSparQlEndpointHttpOptions();

        return this.http.post(environment.apiEndpoints.sparqlQuery, body, httpOptions)
            .pipe(map((apiResponse: APICountResponse) => {
                return parseInt(apiResponse.results.bindings[0].instances.value, 10);
            }));
    }

    public collectClassInstances(sparqlClass: string,
                                 filterOptions?: ResourceSearchInput): Observable<Array<SPARQLResource>> {
        const body = this.constructCollectClassInstancesRequestBody(sparqlClass, filterOptions);
        const httpOptions = this.getSparQlEndpointHttpOptions();

        return this.http.post(environment.apiEndpoints.sparqlQuery, body, httpOptions)
            .pipe(map((apiResponse: APISearchResponse) => {
                return apiResponse.results.bindings.map(binding => new SPARQLResource(binding.url.value));
            }));
    }

    public collectSubClassesOf(sparqlClassUrl: string): Observable<Array<SPARQLResource>> {
        const query = `
            PREFIX : <http://www.semanticweb.org/wade/ontologies/sato#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            SELECT DISTINCT ?url WHERE {
                ?url rdfs:subClassOf <${sparqlClassUrl}> .
            }
            ORDER BY ASC(?url)`;
        const body = {
            query: query.trim().replace('\n', '').replace(/\s+/g, ' ')
        };

        const httpOptions = this.getSparQlEndpointHttpOptions();

        return this.http.post(environment.apiEndpoints.sparqlQuery, body, httpOptions)
            .pipe(map((apiResponse: APISearchResponse) => {
                return apiResponse.results.bindings
                    .filter(subclass => {
                        return subclass.url.value !== 'http://www.w3.org/2002/07/owl#Nothing'
                            && subclass.url.value !== sparqlClassUrl;
                    })
                    .map(subclass => new SPARQLResource(subclass.url.value));
            }));
    }

    public collectPopularSuggestions(): Observable<SPARQLResource[]> {
        const body = this.constructCollectPopularSuggestionsRequestBody();
        const httpOptions = this.getSparQlEndpointHttpOptions();

        return this.http.post(environment.apiEndpoints.sparqlQuery, body, httpOptions)
            .pipe(map((apiResponse: APISearchResponse) => {
                return apiResponse.results.bindings.map(binding => new SPARQLResource(binding.url.value));
            }));
    }

    public suggestFromTopics(topics: Array<string>): Observable<SPARQLResource[]> {
        const body = this.constructSearchByTopicsRequestBody(topics);
        const httpOptions = this.getSparQlEndpointHttpOptions();

        return this.http.post(environment.apiEndpoints.sparqlQuery, body, httpOptions)
            .pipe(map((apiResponse: APISearchResponse) => {
                return apiResponse.results.bindings.map(binding => new SPARQLResource(binding.url.value));
            }));
    }

    public searchByTopic(topic: string): Observable<SPARQLResource[]> {
        const body = this.constructSearchByTopicRequestBody(topic);
        const httpOptions = this.getSparQlEndpointHttpOptions();

        return this.http.post(environment.apiEndpoints.sparqlQuery, body, httpOptions)
            .pipe(map((apiResponse: APISearchResponse) => {
                return apiResponse.results.bindings.map(binding => new SPARQLResource(binding.url.value));
            }));
    }

    private getSparQlEndpointHttpOptions(): { headers: HttpHeaders } {
        return {
            headers: new HttpHeaders({
                Accept: this.acceptHeader,
                'Content-Type': this.contentTypeHeader
            })
        };
    }

    private constructCountClassInstancesRequestBody(sparqlClassUrl: string, filterOptions?: ResourceSearchInput) {
        const query = `
            PREFIX : <http://www.semanticweb.org/wade/ontologies/sato#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            SELECT (COUNT(DISTINCT ?s) AS ?instances) WHERE {
                ?s rdf:type <${sparqlClassUrl}> .
                BIND(?s AS ?url) .
                ${this.buildSparQlSearchFilter(filterOptions)}
            }`;

        console.log('query', query);

        return JSON.stringify({
            query: query.trim().replace('\n', '').replace(/\s+/g, ' ')
        });
    }

    private constructCollectClassInstancesRequestBody(sparqlClassUrl: string, filterOptions?: ResourceSearchInput) {
        const query = `
            PREFIX : <http://www.semanticweb.org/wade/ontologies/sato#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            SELECT DISTINCT ?url WHERE {
                ?s rdf:type <${sparqlClassUrl}> .
                BIND(?s AS ?url) .
                ${this.buildSparQlSearchFilter(filterOptions)}
            }
            ${this.applyResultRestrictions(filterOptions)}`;

        console.log('query', query);

        return JSON.stringify({
            query: query.trim().replace('\n', '').replace(/\s+/g, ' ')
        });
    }

    private buildSparQlSearchFilter(filterOptions?: ResourceSearchInput): string {
        if (!filterOptions || !filterOptions.filters ||
            !Object.values(filterOptions.filters).find(value => !!value)) {
            return '';
        }

        let constraints = '';
        const filters = filterOptions.filters;

        if (filters.pattern) {
            constraints = `${constraints}\nFILTER (CONTAINS(STR(?s), '${filters.pattern}')) .`;
        }

        if (filters.resourceTypes && filters.resourceTypes.length) {
            const resourceTypes = filters.resourceTypes.map(typeUrl => `<${typeUrl}>`).join(', ');
            constraints = `${constraints}
            ?s rdf:type ?type .
            FILTER (?type IN (${resourceTypes})) .`;
        }

        if (filters.includedTopics && filters.includedTopics.length) {
            const topics = filters.includedTopics.map(topicUrl => `<${topicUrl}>`).join(', ');
            const urlFilters = filters.includedTopics
                .map(topicUrl => {
                    const topicName = topicUrl.substr(topicUrl.lastIndexOf('#') + 1);
                    return `CONTAINS(STR(?s), '${topicName}')`;
                })
                .join('|| ');
            constraints = `${constraints}
            ?s :hasTopic ?topic .
            FILTER (?topic IN (${topics}) || ${urlFilters}) .`;
        }

        if (filters.excludedTopics && filters.excludedTopics.length) {
            const filterExpression = filters.excludedTopics
                .map(topicUrl => `FILTER NOT EXISTS { ?s :hasTopic <${topicUrl}> }`)
                .join(' .\n');
            constraints = `${constraints} ${filterExpression} .`;
        }

        if (filters.programmingLanguages && !!filters.programmingLanguages.length) {
            const programmingLanguages = filters.programmingLanguages.map(languageUrl => `<${languageUrl}>`).join(', ');
            constraints = `${constraints}
            ?s :hasProgrammingLanguage ?programmingLanguage .
            FILTER (?programmingLanguage IN (${programmingLanguages})) .`;
        }

        if (filters.platforms && !!filters.platforms.length) {
            const platforms = filters.platforms.map(platformUrl => `<${platformUrl}>`).join(', ');
            const urlFilters = filters.platforms
                .map(platformsUrl => {
                    const platformName = platformsUrl.substr(platformsUrl.lastIndexOf('#') + 1);
                    return `CONTAINS(STR(?s), '${platformName}')`;
                })
                .join('|| ');
            constraints = `${constraints}
            ?s :hasTopic ?platform .
            FILTER (?platform IN (${platforms}) || ${urlFilters}) .`;
        }

        if (!!filters.dateRange) {
            if (filters.dateRange.startDate && !filters.dateRange.endDate) {
                const startDate = filters.dateRange.startDate;
                // tslint:disable-next-line:max-line-length
                const dateString = `${startDate.getFullYear()}-${this.appendLeadingZeroes(startDate.getMonth() + 1)}-${this.appendLeadingZeroes(startDate.getDate())}`;
                constraints = `${constraints}
                ?s :createdAt ?date .
                FILTER(?date >= '${dateString}'^^xsd:date)`;
            }

            if (filters.dateRange.endDate && !filters.dateRange.startDate) {
                const startDate = filters.dateRange.startDate;
                // tslint:disable-next-line:max-line-length
                const dateString = `${startDate.getFullYear()}-${this.appendLeadingZeroes(startDate.getMonth() + 1)}-${this.appendLeadingZeroes(startDate.getDate())}`;
                constraints = `${constraints}
                ?s :createdAt ?date .
                FILTER(?date <= '${dateString}'^^xsd:date)`;
            }

            if (filters.dateRange.endDate && filters.dateRange.startDate) {
                const startDate = filters.dateRange.startDate;
                const endDate = filters.dateRange.endDate;
                // tslint:disable-next-line:max-line-length
                const startDateString = `${startDate.getFullYear()}-${this.appendLeadingZeroes(startDate.getMonth() + 1)}-${this.appendLeadingZeroes(startDate.getDate())}`;
                // tslint:disable-next-line:max-line-length
                const endDateString = `${endDate.getFullYear()}-${this.appendLeadingZeroes(endDate.getMonth() + 1)}-${this.appendLeadingZeroes(endDate.getDate())}`;
                constraints = `${constraints}
                ?s :createdAt ?date .
                FILTER(?date >= '${startDateString}'^^xsd:date && ?date <= '${endDateString}'^^xsd:date)`;
            }
        }

        return constraints;
    }

    private applyResultRestrictions(filterOptions?: ResourceSearchInput): string {
        if (!filterOptions) {
            return '';
        }

        let restrictions = '';

        if (!!filterOptions.offset) {
            restrictions = `${restrictions} OFFSET ${filterOptions.offset} `;
        }

        if (!!filterOptions.size) {
            restrictions = `${restrictions} LIMIT ${filterOptions.size} `;
        }

        return restrictions;
    }

    private constructCollectPopularTopicsRequestBody(limit: number): string {
        const query = `
            PREFIX : <http://www.semanticweb.org/wade/ontologies/sato#>
            SELECT ?topic (COUNT(?topic) AS ?occurrences) {
                ?url :hasTopic ?topic
            }
            GROUP BY ?topic
            ORDER BY DESC(?occurrences)
            LIMIT ${limit}`;

        return JSON.stringify({
            query: query.trim().replace('\n', '').replace(/\s+/g, ' ')
        });
    }

    private constructCollectPopularSuggestionsRequestBody(): string {
        const types = ['Article', 'News', 'Repository'].map(type => `<${RdfNamespace.SATO}${type}>`);
        const query = `
            PREFIX : <http://www.semanticweb.org/wade/ontologies/sato#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            SELECT DISTINCT ?url WHERE {
                ?url rdf:type ?type .
                FILTER (?type IN (${types})) .
                ?url :hasTopic ?topic .
                {
                    SELECT ?topic (COUNT(?topic) AS ?occurrences) {
                        ?url :hasTopic ?topic
                    }
                    GROUP BY ?topic
                    ORDER BY DESC(?occurrences)
                    LIMIT 100
                }
            }
            ORDER BY RAND()
            LIMIT ${this.SUGGESTIONS_COUNT}`;

        return JSON.stringify({
            query: query.trim().replace('\n', '').replace(/\s+/g, ' ')
        });
    }

    private constructSearchByTopicsRequestBody(topics: Array<string>): string {
        const types = ['Article', 'News', 'Repository'].map(type => `<${RdfNamespace.SATO}${type}>`);
        const query = `
            PREFIX : <http://www.semanticweb.org/wade/ontologies/sato#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            SELECT DISTINCT ?url {
                ?url rdf:type ?type .
                FILTER (?type IN (${types})) .
                ?url :hasTopic ?topic .
                FILTER ${this.constructMultiTopicFilterCondition(topics)} .
            }
            ORDER BY RAND()
            LIMIT ${this.SUGGESTIONS_COUNT}`;

        return JSON.stringify({
            query: query.trim().replace('\n', '').replace(/\s+/g, ' ')
        });
    }

    private constructMultiTopicFilterCondition(topics: Array<string>): string {
        let filter = '(';
        topics.forEach((topic, index) => {
            filter += `CONTAINS(STR(?topic), '${topic}') || CONTAINS(STR(?url), '${topic}')`;
            if (index < topics.length - 1) {
                filter += ' || ';
            }
        });
        filter += ')';
        return filter;
    }

    private constructSearchByTopicRequestBody(topic: string): string {
        const body = {
            query: this.constructQueryForTopic(topic)
        };

        return JSON.stringify(body);
    }

    private constructQueryForTopic(topic: string, pageSize: number = 10, offset: number = 0): string {
        return `
            PREFIX : <http://www.semanticweb.org/wade/ontologies/sato#>
            SELECT DISTINCT ?url {
                ?url :hasTopic ?topic .
                FILTER ((CONTAINS(STR(?topic), "${topic}") || CONTAINS(STR(?url), "${topic}"))) .
                }
            LIMIT ${pageSize} OFFSET ${offset}
    `.trim().replace('\n', '').replace(/\s+/g, ' ');
    }

    private appendLeadingZeroes(n) {
        if (n <= 9) {
            return '0' + n;
        }
        return n;
    }
}
