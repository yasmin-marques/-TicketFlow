package br.com.ticketflow.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "permissions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Permission {

    @Id
    private Short id;

    @Column(nullable = false, unique = true, length = 60)
    private String code;

    @Column(nullable = false, length = 200)
    private String description;
}
