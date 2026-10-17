package br.com.ticketflow.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "categories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Category {

    @Id
    private Short id;

    @Column(nullable = false, unique = true, length = 40)
    private String slug;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private short sortOrder;
}
